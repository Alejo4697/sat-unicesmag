/* ==========================================================================
   Feature: Remisiones (incluye escalado 48h)
   GET   /api/remisiones          -> lista
   GET   /api/remisiones/areas    -> catálogo de áreas de destino ACTIVAS
   GET   /api/remisiones/estados  -> catálogo de estados de remisión ACTIVOS
   GET   /api/remisiones/rutas    -> Matriz de Bienestar: rutas ACTIVAS
   POST  /api/remisiones          -> crear remisión
   PATCH /api/remisiones/:id      -> actualizar estado / recomendaciones
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
import { esUsuarioRestringidoAPrograma, coincidePrograma } from "../../shared/security/alcanceDirectivo.js";

const router = Router();

router.use(identifyUser, requireModule("remisiones"));

// --------------------------------------------------------------------------
// Búsqueda de estudiantes por código estudiantil (seguridad institucional)
// Disponible para todos los perfiles con acceso al módulo de remisiones.
// --------------------------------------------------------------------------
router.get("/buscar-estudiante", async (req, res, next) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.json([]);
  }

  const esRestringido = esUsuarioRestringidoAPrograma(req.user);
  const progUser = req.user?.programa;

  try {
    let sql = `SELECT DISTINCT
         e.id_estudiantes AS id,
         COALESCE(m.codigo_externo, e.codigo_externo) AS codigo,
         COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
         COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
         COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
         CONCAT_WS(' ', 
           COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres), 
           COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos)
         ) AS "nombreCompleto",
         COALESCE(per.correo_institucional, per.correo_electronico, e.correo_institucional) AS email,
         COALESCE(p.nombre, 'Programa Institucional') AS programa,
         COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
         COALESCE(rr.nombre, 'Sin evaluar') AS riesgo
       FROM sat.estudiantes e
       LEFT JOIN sat.personas per ON per.id = e.id_personas
       LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
       LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
       LEFT JOIN LATERAL (
         SELECT cr_1.id_rangos_riesgo
         FROM sat.calificaciones_riesgo cr_1
         WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
         ORDER BY cr_1.calculado_en DESC
         LIMIT 1
       ) cr ON true
       LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
       WHERE (e.codigo_externo = $1
          OR m.codigo_externo = $1
          OR e.codigo_externo ILIKE $2
          OR m.codigo_externo ILIKE $2
          OR per.numero_identificacion = $1
          OR e.numero_documento = $1
          OR per.numero_identificacion ILIKE $2
          OR e.numero_documento ILIKE $2)`;

    const params = [q, `%${q}%`];
    if (esRestringido && progUser) {
      sql += ` AND (LOWER(COALESCE(p.nombre, '')) ILIKE '%' || LOWER($3) || '%')`;
      params.push(progUser);
    }

    sql += ` ORDER BY "nombreCompleto" ASC LIMIT 20`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (r.id_remisiones)
                r.id_remisiones AS id,
                e.codigo_externo AS "codigoEstudiante",
                COALESCE(per.numero_identificacion, e.numero_documento) AS "documentoEstudiante",
                COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS "nombresEstudiante",
                COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS "apellidosEstudiante",
                CONCAT_WS(' ', 
                  COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres), 
                  COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos)
                ) AS "nombreEstudiante",
                p.nombre AS "programaEstudiante",
                CONCAT(ur.nombres, ' ', ur.apellidos) AS "remitidoPor",
                r.id_usuarios_remitente AS "idUsuarioRemitente",
                r.id_usuarios_profesional AS "idUsuarioProfesional",
                r.id_dependencias AS "idDependencia",
                d.nombre AS "areaDestino",
                CASE
                  WHEN r.id_usuarios_profesional IS NOT NULL AND r.id_usuarios_profesional <> r.id_usuarios_remitente
                    THEN CONCAT(up.nombres, ' ', up.apellidos)
                  ELSE COALESCE(d.nombre, 'Bandeja General / Por Asignar')
                END AS "profesionalAsignado",
                CASE WHEN r.escalada THEN 'Alto' ELSE 'Medio' END AS "nivelRiesgo",
                r.motivo AS "motivoRemision",
                r.generada_en AS "fechaRemision",
                er.nombre AS estado,
                r.escalada AS "escalado48h",
                r.recomendaciones_docente AS "recomendacionesAula"
         FROM sat.remisiones r
         JOIN sat.casos c ON r.id_casos = c.id_casos
         JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.personas per ON per.id = e.id_personas
         LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
         LEFT JOIN sat.dependencias d ON r.id_dependencias = d.id_dependencias
         LEFT JOIN sat.estados_remision er ON r.id_estados_remision = er.id_estados_remision
         LEFT JOIN sat.usuarios ur ON r.id_usuarios_remitente = ur.id_usuarios
         LEFT JOIN sat.usuarios up ON r.id_usuarios_profesional = up.id_usuarios
         ORDER BY r.id_remisiones, r.generada_en DESC
       ) sub
       ORDER BY sub."fechaRemision" DESC
       LIMIT 150`
    );

    const mockPorId = new Map(MOCK_DATA.remisiones.map((m) => [m.id, m]));
    const enriquecidas = rows.map((r) => {
      const m = mockPorId.get(r.id);
      return m ? { ...m, ...r, profesionalAsignado: m.profesionalAsignado || r.profesionalAsignado, nivelRiesgo: m.nivelRiesgo || r.nivelRiesgo } : r;
    });
    const idsDb = new Set(rows.map((r) => r.id));
    const mocksRestantes = MOCK_DATA.remisiones.filter((m) => !idsDb.has(m.id));

    let resultado = [...enriquecidas, ...mocksRestantes];
    if (esUsuarioRestringidoAPrograma(req.user)) {
      const progUser = req.user.programa;
      const userId = req.user.id;
      const userNombre = (req.user.nombre || "").toLowerCase();
      resultado = resultado.filter((r) => {
        const coincideProg = coincidePrograma(r.programaEstudiante, progUser);
        const esMio = (r.idUsuarioRemitente && r.idUsuarioRemitente === userId) ||
                      (r.remitidoPor && userNombre && r.remitidoPor.toLowerCase().includes(userNombre)) ||
                      (r.idUsuarioProfesional && r.idUsuarioProfesional === userId) ||
                      (r.profesionalAsignado && userNombre && r.profesionalAsignado.toLowerCase().includes(userNombre));
        return coincideProg || esMio;
      });
    }

    res.json(resultado);
  } catch (err) {
    console.warn("Fallo al consultar remisiones en PostgreSQL:", err.message);
    let lista = MOCK_DATA.remisiones;
    if (esUsuarioRestringidoAPrograma(req.user)) {
      const progUser = req.user.programa;
      const userId = req.user.id;
      const userNombre = (req.user.nombre || "").toLowerCase();
      lista = lista.filter((r) => {
        const coincideProg = coincidePrograma(r.programaEstudiante, progUser);
        const esMio = (r.idUsuarioRemitente && r.idUsuarioRemitente === userId) ||
                      (r.remitidoPor && userNombre && r.remitidoPor.toLowerCase().includes(userNombre));
        return coincideProg || esMio;
      });
    }
    res.json(lista);
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
  let nombreEstudianteFinal = null;
  let codigoEstudianteReal = codigoEstudiante;
  let documentoEstudianteFinal = null;
  let programaEstudianteFinal = null;

  try {
    // 1. Obtener estudiante en DB exclusivamente por código estudiantil
    const { rows: estRows } = await query(
      `SELECT e.id_estudiantes, COALESCE(m.codigo_externo, e.codigo_externo) AS codigo,
              COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
              COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
              COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
              p.nombre AS programa
       FROM sat.estudiantes e
       LEFT JOIN sat.personas per ON per.id = e.id_personas
       LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
       LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
       WHERE e.codigo_externo = $1
          OR m.codigo_externo = $1
          OR e.id_estudiantes::text = $1
       LIMIT 1`,
      [codigoEstudiante]
    );

    if (estRows.length > 0) {
      const idEstudiante = estRows[0].id_estudiantes;
      codigoEstudianteReal = estRows[0].codigo || codigoEstudiante;
      documentoEstudianteFinal = estRows[0].documento;
      nombreEstudianteFinal = `${estRows[0].nombres} ${estRows[0].apellidos}`.trim();
      programaEstudianteFinal = estRows[0].programa;

      if (esUsuarioRestringidoAPrograma(req.user) && programaEstudianteFinal) {
        if (!coincidePrograma(programaEstudianteFinal, req.user.programa)) {
          return res.status(403).json({
            error: `Seguridad SAT: Su perfil solo tiene autorización para remitir estudiantes pertenecientes a su programa académico (${req.user.programa}).`
          });
        }
      }

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

      // 4. Obtener usuario remitente y profesional encargado del área/dependencia
      const { rows: usuarios } = await query(`SELECT id_usuarios FROM sat.usuarios WHERE activo = true LIMIT 1`);
      const idUser = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.user?.id)
        ? req.user.id
        : usuarios[0]?.id_usuarios;

      let idProfesionalDestino = null;
      if (idDependencia) {
        const { rows: profRows } = await query(
          `SELECT u.id_usuarios
           FROM sat.usuarios u
           LEFT JOIN sat.usuarios_dependencias ud ON ud.id_usuarios = u.id_usuarios
           WHERE u.activo = true
             AND (
               ud.id_dependencias = $1
               OR ($2::text IS NOT NULL AND LOWER(u.nombres || ' ' || u.apellidos) ILIKE '%' || LOWER($2) || '%')
               OR ($3::text IS NOT NULL AND LOWER(COALESCE(u.cargo, '')) ILIKE '%' || LOWER($3) || '%')
             )
           LIMIT 1`,
          [idDependencia, destino?.profesionalAsignado || null, destino?.areaDestino || null]
        );
        idProfesionalDestino = profRows[0]?.id_usuarios || null;
      }

      if (!idProfesionalDestino) {
        // Asignar un profesional distinto al remitente para que quien remite no quede asignado a sí mismo
        const { rows: altProf } = await query(
          `SELECT u.id_usuarios
           FROM sat.usuarios u
           LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
           LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
           WHERE u.activo = true
             AND u.id_usuarios <> $1
             AND (LOWER(COALESCE(r.nombre, '')) IN ('profesional', 'admin', 'administrador') OR u.cargo ILIKE '%psic%' OR u.cargo ILIKE '%salud%' OR u.cargo ILIKE '%trabajo%')
           ORDER BY CASE WHEN LOWER(COALESCE(r.nombre, '')) = 'profesional' THEN 1 ELSE 2 END
           LIMIT 1`,
          [idUser]
        );
        idProfesionalDestino = altProf[0]?.id_usuarios || null;
      }

      const { rows: insertRem } = await query(
        `INSERT INTO sat.remisiones
          (id_casos, id_dependencias, id_usuarios_profesional, id_usuarios_remitente, id_estados_remision, motivo, generada_en, escalada, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW())
         RETURNING id_remisiones`,
        [
          idCaso,
          idDependencia,
          idProfesionalDestino || idUser,
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
    codigoEstudiante: codigoEstudianteReal,
    documentoEstudiante: documentoEstudianteFinal,
    nombreEstudiante: nombreEstudianteFinal,
    programaEstudiante: programaEstudianteFinal,
    remitidoPor: `${req.user?.nombre || "Personal Institucional"} (${req.user?.cargo || "Docente"})`,
    idUsuarioRemitente: req.user?.id || null,
    idUsuarioProfesional: idProfesionalDestino || null,
    idDependencia: idDependencia || null,
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

// Actualizar estado de remisión (Solo permitido para receptor o administrador)
router.patch("/:id", async (req, res, next) => {
  const { id } = req.params;
  const { estado, recomendacionesAula } = req.body;

  const userId = req.user?.id;
  const userRol = req.user?.rol;
  const userNombre = (req.user?.nombre || "").toLowerCase().trim();
  const userCargo = (req.user?.cargo || "").toLowerCase().trim();
  const userDep = (req.user?.dependencia || "").toLowerCase().trim();

  // Control de seguridad institucional:
  // Quien realiza la remisión NO puede cambiar su estado.
  // Solo quien la recibe (o un administrador) puede cambiar el estado y actualizarla.
  if (userRol !== "admin") {
    // 1. Verificación en base de datos PostgreSQL
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      try {
        const { rows: dbRem } = await query(
          `SELECT r.id_remisiones, r.id_usuarios_remitente, r.id_usuarios_profesional, 
                  r.id_dependencias, d.nombre AS dependencia_nombre,
                  ur.nombres AS remitente_nombres, ur.apellidos AS remitente_apellidos,
                  up.nombres AS profesional_nombres, up.apellidos AS profesional_apellidos
           FROM sat.remisiones r
           LEFT JOIN sat.dependencias d ON r.id_dependencias = d.id_dependencias
           LEFT JOIN sat.usuarios ur ON r.id_usuarios_remitente = ur.id_usuarios
           LEFT JOIN sat.usuarios up ON r.id_usuarios_profesional = up.id_usuarios
           WHERE r.id_remisiones = $1`,
          [id]
        );

        if (dbRem.length > 0) {
          const rem = dbRem[0];
          const esRemitente = Boolean(
            (userId && rem.id_usuarios_remitente === userId) ||
            (userNombre && `${rem.remitente_nombres} ${rem.remitente_apellidos}`.toLowerCase().includes(userNombre))
          );

          const esReceptor = Boolean(
            (userId && rem.id_usuarios_profesional === userId && rem.id_usuarios_profesional !== rem.id_usuarios_remitente) ||
            (userNombre && `${rem.profesional_nombres} ${rem.profesional_apellidos}`.toLowerCase().includes(userNombre)) ||
            (userDep && rem.dependencia_nombre && rem.dependencia_nombre.toLowerCase().includes(userDep))
          );

          if (esRemitente && !esReceptor) {
            return res.status(403).json({
              error: "Control de seguridad SAT: Quien realiza la remisión no puede cambiar su estado. El estado permanece como 'Generada' hasta que el profesional o área receptora la atienda y actualice."
            });
          }
        }
      } catch (checkErr) {
        console.warn("Fallo en verificación de seguridad de remisiones:", checkErr.message);
      }
    }

    // 2. Verificación en MOCK_DATA
    const remMock = MOCK_DATA.remisiones.find((r) => r.id === id);
    if (remMock) {
      const remitidoPor = String(remMock.remitidoPor || "").toLowerCase();
      const profAsignado = String(remMock.profesionalAsignado || "").toLowerCase();
      const areaDestino = String(remMock.areaDestino || "").toLowerCase();

      const esRemitenteMock = userNombre && remitidoPor.includes(userNombre);
      const esReceptorMock =
        (userNombre && profAsignado.includes(userNombre)) ||
        (userDep && areaDestino.includes(userDep));

      if (esRemitenteMock && !esReceptorMock) {
        return res.status(403).json({
          error: "Control de seguridad SAT: Quien realiza la remisión no puede cambiar su estado. El estado permanece como 'Generada' hasta que el profesional o área receptora la atienda y actualice."
        });
      }
    }
  }

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

