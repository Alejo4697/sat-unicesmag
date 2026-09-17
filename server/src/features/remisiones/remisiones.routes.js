/* ==========================================================================
   Feature: Remisiones (RQF09/RQF10 - incluye escalado 48h - RQF17/RQF18)
   GET   /api/remisiones          -> lista
   GET   /api/remisiones/areas    -> catálogo de áreas de destino ACTIVAS
   GET   /api/remisiones/estados  -> catálogo de estados de remisión ACTIVOS
   GET   /api/remisiones/rutas    -> Matriz de Bienestar: rutas ACTIVAS
   POST  /api/remisiones          -> crear remisión (RQF17)
   PATCH /api/remisiones/:id      -> actualizar estado / recomendaciones (RQF18)
   ==========================================================================
   Las remisiones en sí siguen en MOCK_DATA (no migradas). Lo único que se
   consulta contra PostgreSQL (schema `sat`, vía shared/db/pool.js) son los
   catálogos administrables desde Administración:
     - /areas   <- sat.dependencias (tipo 'AREA_ATENCION', activo=true)
     - /estados <- sat.estados_remision (activo=true)
     - /rutas   <- sat.rutas_remision + programa/componente/línea/tipo de
                   apoyo/oficina (ver shared/db/matriz_bienestar.sql)
   El panel de Remisiones ya no trae esas listas hardcodeadas.

   Al crear, el cliente manda `idRuta` y el servidor deduce la oficina
   (areaDestino) y el profesional responsable desde la BD: no se confía en
   lo que mande el navegador. `areaDestino` suelto solo se acepta para áreas
   que no tienen ninguna ruta en la matriz (p. ej. Consultorios Jurídicos).
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("remisiones"));

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id_remisiones AS id,
              e.codigo_externo AS "codigoEstudiante",
              CONCAT(ur.nombres, ' ', ur.apellidos) AS "remitidoPor",
              d.nombre AS "areaDestino",
              COALESCE(CONCAT(up.nombres, ' ', up.apellidos), 'Bandeja General / Por Asignar') AS "profesionalAsignado",
              'Medio' AS "nivelRiesgo",
              r.motivo AS "motivoRemision",
              r.generada_en AS "fechaRemision",
              er.nombre AS estado,
              r.escalada AS "escalado48h",
              r.recomendaciones_docente AS "recomendacionesAula"
       FROM sat.remisiones r
       JOIN sat.casos c ON r.id_casos = c.id_casos
       JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
       LEFT JOIN sat.dependencias d ON r.id_dependencias = d.id_dependencias
       LEFT JOIN sat.estados_remision er ON r.id_estados_remision = er.id_estados_remision
       LEFT JOIN sat.usuarios ur ON r.id_usuarios_remitente = ur.id_usuarios
       LEFT JOIN sat.usuarios up ON r.id_usuarios_profesional = up.id_usuarios
       ORDER BY r.generada_en DESC
       LIMIT 100`
    );

    const idsDb = new Set(rows.map((r) => r.id));
    const mocksRestantes = MOCK_DATA.remisiones.filter((m) => !idsDb.has(m.id));

    res.json([...rows, ...mocksRestantes]);
  } catch (err) {
    console.warn("Fallo al consultar remisiones en PostgreSQL:", err.message);
    res.json(MOCK_DATA.remisiones);
  }
});

// Áreas de destino que hoy pueden elegirse al generar una remisión (solo
// activas). Las que se inhabiliten desde Administración dejan de aparecer
// acá, pero las remisiones históricas que ya las usaban no cambian.
router.get("/areas", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.id_dependencias AS id, d.nombre,
              d.es_confidencialidad_especial AS "esConfidencialidad",
              EXISTS (
                SELECT 1 FROM sat.rutas_remision r
                WHERE r.id_dependencias = d.id_dependencias AND r.activo
              ) AS "tieneRutas"
       FROM sat.dependencias d
       WHERE d.tipo = 'AREA_ATENCION' AND d.activo = true
       ORDER BY d.nombre`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Estados a los que el modal "Gestionar Estado" puede mover una remisión
// (solo activos, en su orden de flujo). El cliente agrega aparte el estado
// actual del registro si quedó inhabilitado.
router.get("/estados", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal"
       FROM sat.estados_remision
       WHERE activo = true
       ORDER BY orden`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// Matriz de Bienestar (Excel "Sistema de bienestar para intervenciones y
// remisiones"). Solo rutas activas y completas (con oficina y tipo de apoyo).
// --------------------------------------------------------------------------
const RUTA_SELECT = `
  SELECT r.id_rutas_remision        AS id,
         r.nombre                   AS proyecto,
         p.nombre                   AS programa,
         c.nombre                   AS componente,
         l.nombre                   AS "lineaAccion",
         t.numero                   AS "tipoApoyoNumero",
         t.nombre                   AS "tipoApoyo",
         d.nombre                   AS oficina,
         d.id_dependencias          AS "idDependencia",
         d.es_confidencialidad_especial AS "esConfidencialidad",
         r.profesional_responsable  AS "profesionalResponsable"
  FROM sat.rutas_remision r
  JOIN sat.programas_bienestar   p ON p.id_programas_bienestar   = r.id_programas_bienestar
  JOIN sat.componentes_bienestar c ON c.id_componentes_bienestar = p.id_componentes_bienestar
  JOIN sat.lineas_accion         l ON l.id_lineas_accion         = c.id_lineas_accion
  JOIN sat.tipos_apoyo           t ON t.id_tipos_apoyo           = r.id_tipos_apoyo
  JOIN sat.dependencias          d ON d.id_dependencias          = r.id_dependencias
  WHERE r.activo AND p.activo AND c.activo AND l.activo AND t.activo AND d.activo
`;

router.get("/rutas", async (req, res, next) => {
  try {
    const { rows } = await query(`${RUTA_SELECT} ORDER BY t.numero, p.nombre, r.nombre`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const SIN_PROFESIONAL = "Bandeja General / Por Asignar";

// Crear remisión en PostgreSQL
router.post("/", async (req, res, next) => {
  const { codigoEstudiante, idRuta, areaDestino, nivelRiesgo, motivoRemision } = req.body;

  if (!codigoEstudiante || (!idRuta && !areaDestino) || !motivoRemision) {
    return res.status(400).json({ error: "Complete todos los campos obligatorios." });
  }

  // Datos de destino resueltos en el servidor.
  let destino;
  let idDependencia = null;
  try {
    if (idRuta) {
      const { rows } = await query(`${RUTA_SELECT} AND r.id_rutas_remision = $1`, [idRuta]);
      if (!rows.length) {
        return res.status(400).json({ error: "El servicio seleccionado no existe o está inhabilitado." });
      }
      const ruta = rows[0];
      idDependencia = ruta.idDependencia;
      destino = {
        idRuta: ruta.id,
        areaDestino: ruta.oficina,
        profesionalAsignado: ruta.profesionalResponsable || SIN_PROFESIONAL,
        proyecto: ruta.proyecto,
        programa: ruta.programa,
        componente: ruta.componente,
        lineaAccion: ruta.lineaAccion,
        tipoApoyo: `Apoyo ${ruta.tipoApoyoNumero}: ${ruta.tipoApoyo}`
      };
    } else {
      // Remisión directa: solo a áreas activas SIN rutas en la matriz.
      const { rows } = await query(
        `SELECT d.id_dependencias, d.nombre
         FROM sat.dependencias d
         WHERE d.tipo = 'AREA_ATENCION' AND d.activo AND d.nombre = $1
           AND NOT EXISTS (
             SELECT 1 FROM sat.rutas_remision r
             WHERE r.id_dependencias = d.id_dependencias AND r.activo
           )`,
        [areaDestino]
      );
      if (!rows.length) {
        return res.status(400).json({
          error: "Esa área se atiende por la Matriz de Bienestar: seleccione el tipo de apoyo y el servicio."
        });
      }
      idDependencia = rows[0].id_dependencias;
      destino = {
        idRuta: null,
        areaDestino: rows[0].nombre,
        profesionalAsignado: SIN_PROFESIONAL,
        proyecto: null,
        programa: null,
        componente: null,
        lineaAccion: null,
        tipoApoyo: null
      };
    }
  } catch (err) {
    if (err.code === "22P02") {
      return res.status(400).json({ error: "Identificador de servicio inválido." });
    }
    return next(err);
  }

  let idRemisionGenerada = null;
  try {
    // 1. Obtener estudiante en DB
    const { rows: estRows } = await query(
      `SELECT id_estudiantes FROM sat.estudiantes WHERE codigo_externo = $1 OR numero_documento = $1 OR id_estudiantes::text = $1 LIMIT 1`,
      [codigoEstudiante]
    );

    if (estRows.length > 0) {
      const idEstudiante = estRows[0].id_estudiantes;

      // 2. Obtener o crear caso
      const { rows: casos } = await query(
        `SELECT id_casos FROM sat.casos WHERE id_estudiantes = $1 ORDER BY creado_en DESC LIMIT 1`,
        [idEstudiante]
      );
      let idCaso = casos[0]?.id_casos;
      if (!idCaso) {
        const { rows: estados } = await query(
          `SELECT id_estados_caso FROM sat.estados_caso WHERE LOWER(nombre) = 'abierto' LIMIT 1`
        );
        const { rows: nuevoCaso } = await query(
          `INSERT INTO sat.casos (id_estudiantes, id_estados_caso, es_confidencialidad_especial, abierto_en, creado_en, actualizado_en)
           VALUES ($1, $2, false, NOW(), NOW(), NOW()) RETURNING id_casos`,
          [idEstudiante, estados[0]?.id_estados_caso]
        );
        idCaso = nuevoCaso[0]?.id_casos;
      }

      // 3. Obtener id de estado 'Generada'
      const { rows: estRem } = await query(
        `SELECT id_estados_remision FROM sat.estados_remision WHERE LOWER(nombre) = 'generada' LIMIT 1`
      );
      const idEstadoGenerada = estRem[0]?.id_estados_remision;

      // 4. Obtener usuario remitente y profesional
      const { rows: usuarios } = await query(`SELECT id_usuarios FROM sat.usuarios WHERE activo = true LIMIT 1`);
      const idUser = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.user?.id)
        ? req.user.id
        : usuarios[0]?.id_usuarios;

      const { rows: insertRem } = await query(
        `INSERT INTO sat.remisiones
          (id_casos, id_dependencias, id_usuarios_profesional, id_usuarios_remitente, id_estados_remision, motivo, generada_en, escalada, actualizado_en)
         VALUES ($1, $2, $3, $3, $4, $5, NOW(), $6, NOW())
         RETURNING id_remisiones`,
        [
          idCaso,
          idDependencia,
          idUser,
          idEstadoGenerada,
          motivoRemision,
          nivelRiesgo === "Alto" || nivelRiesgo === "Muy Alto"
        ]
      );
      idRemisionGenerada = insertRem[0]?.id_remisiones;
    }
  } catch (dbSaveErr) {
    console.warn("Fallo al guardar remisión en PostgreSQL, usando fallback:", dbSaveErr.message);
  }

  const nueva = {
    id: idRemisionGenerada || `REM-2026-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    remitidoPor: `${req.user?.nombre || "Personal Institucional"} (${req.user?.cargo || "Docente"})`,
    ...destino,
    nivelRiesgo: nivelRiesgo || "Medio",
    motivoRemision,
    fechaRemision: new Date().toISOString(),
    estado: "Generada",
    escalado48h: nivelRiesgo === "Alto" || nivelRiesgo === "Muy Alto",
    recomendacionesAula: ""
  };

  MOCK_DATA.remisiones.unshift(nueva);
  res.status(201).json(nueva);
});

// Actualizar estado de remisión
router.patch("/:id", async (req, res, next) => {
  const { id } = req.params;
  const { estado, recomendacionesAula } = req.body;

  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      let idEstado = null;
      if (estado) {
        const { rows: estRows } = await query(
          `SELECT id_estados_remision FROM sat.estados_remision WHERE LOWER(nombre) = LOWER($1) LIMIT 1`,
          [estado]
        );
        idEstado = estRows[0]?.id_estados_remision;
      }

      await query(
        `UPDATE sat.remisiones
         SET id_estados_remision = COALESCE($1, id_estados_remision),
             recomendaciones_docente = COALESCE($2, recomendaciones_docente),
             actualizado_en = NOW()
         WHERE id_remisiones = $3`,
        [idEstado, recomendacionesAula || null, id]
      );
    }
  } catch (dbErr) {
    console.warn("Fallo al actualizar remisión en PostgreSQL:", dbErr.message);
  }

  const remision = MOCK_DATA.remisiones.find((r) => r.id === id);
  if (remision) {
    if (estado) remision.estado = estado;
    if (recomendacionesAula !== undefined) remision.recomendacionesAula = recomendacionesAula;
    return res.json(remision);
  }

  res.json({ id, estado, recomendacionesAula, ok: true });
});

export default router;

