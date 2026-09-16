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

router.get("/", (req, res) => {
  res.json(MOCK_DATA.remisiones);
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

// Espeja crearRemision() de assets/js/remisiones.js.
router.post("/", async (req, res, next) => {
  const { codigoEstudiante, idRuta, areaDestino, nivelRiesgo, motivoRemision } = req.body;

  if (!codigoEstudiante || (!idRuta && !areaDestino) || !motivoRemision) {
    return res.status(400).json({ error: "Complete todos los campos obligatorios." });
  }

  // Datos de destino resueltos en el servidor.
  let destino;
  try {
    if (idRuta) {
      const { rows } = await query(`${RUTA_SELECT} AND r.id_rutas_remision = $1`, [idRuta]);
      if (!rows.length) {
        return res.status(400).json({ error: "El servicio seleccionado no existe o está inhabilitado." });
      }
      const ruta = rows[0];
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
        `SELECT d.nombre
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

  const nueva = {
    id: `REM-2025-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    remitidoPor: `${req.user.nombre} (${req.user.cargo})`,
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

// Espeja guardarEstadoRemision() del modal "Gestionar Estado".
router.patch("/:id", async (req, res, next) => {
  const remision = MOCK_DATA.remisiones.find((r) => r.id === req.params.id);
  if (!remision) {
    return res.status(404).json({ error: "Remisión no encontrada." });
  }

  const { estado, recomendacionesAula } = req.body;

  // Solo se valida contra el catálogo cuando el estado realmente cambia:
  // así una remisión que ya está en un estado luego inhabilitado se puede
  // seguir guardando (p. ej. para editar solo las recomendaciones).
  if (estado && estado !== remision.estado) {
    try {
      const { rows } = await query(
        `SELECT nombre FROM sat.estados_remision WHERE activo = true ORDER BY orden`
      );
      const validos = rows.map((r) => r.nombre);
      if (!validos.includes(estado)) {
        return res.status(400).json({
          error: `Estado inválido o inhabilitado. Use uno de: ${validos.join(", ")}.`
        });
      }
    } catch (err) {
      return next(err);
    }
  }

  if (estado) remision.estado = estado;
  if (recomendacionesAula !== undefined) remision.recomendacionesAula = recomendacionesAula;

  res.json(remision);
});

export default router;
