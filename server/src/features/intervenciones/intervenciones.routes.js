/* ==========================================================================
   Feature: Intervenciones (RQF04, RQF16, RQF19)
   GET  /api/intervenciones        -> lista (aplica RNF01 sobre casos VBG)
   GET  /api/intervenciones/tipos  -> catálogo de tipos de intervención ACTIVOS
   POST /api/intervenciones        -> registrar intervención
   ==========================================================================
   Las intervenciones en sí siguen en MOCK_DATA (no migradas). Lo único que
   se consulta contra PostgreSQL (schema `sat`, vía shared/db/pool.js) es el
   catálogo de tipos de intervención, administrable desde Administración:
     - /tipos <- sat.tipos_intervencion (activo=true)
   `tipoIntervencion` pasa a ser obligatorio al registrar (el mockup no lo
   capturaba; el diseño de BD lo exige: sat.intervenciones.id_tipos_intervencion
   es NOT NULL).
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("intervenciones"));

// Tipos que hoy pueden elegirse al registrar una intervención (solo activos).
// Los que se inhabiliten desde Administración dejan de aparecer acá, pero las
// intervenciones históricas que ya los usaban no cambian.
router.get("/tipos", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_tipos_intervencion AS id, nombre, descripcion
       FROM sat.tipos_intervencion
       WHERE activo = true
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  const { codigoEstudiante } = req.query;

  try {
    let sql = `
      SELECT i.id_intervenciones AS id,
             e.codigo_externo AS "codigoEstudiante",
             CONCAT(u.nombres, ' ', u.apellidos) AS "atendidoPor",
             'Docente / Profesional' AS "cargoAtendio",
             i.id_usuarios AS "idUsuarioAtendio",
             i.fecha_atencion AS fecha,
             i.creado_en AS "fechaRegistro",
             ti.nombre AS "tipoIntervencion",
             i.descripcion AS motivo,
             i.descripcion AS "resumenAcuerdo",
             c.es_confidencialidad_especial AS "esSensibleVBG",
             (i.estado = 'Cerrada' OR i.cerrada_en IS NOT NULL) AS cerrado
      FROM sat.intervenciones i
      JOIN sat.casos c ON i.id_casos = c.id_casos
      JOIN sat.estudiantes e ON c.id_estudiantes = e.id_estudiantes
      JOIN sat.tipos_intervencion ti ON i.id_tipos_intervencion = ti.id_tipos_intervencion
      LEFT JOIN sat.usuarios u ON i.id_usuarios = u.id_usuarios
    `;
    const params = [];

    if (codigoEstudiante) {
      sql += ` WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR e.id_estudiantes::text = $1`;
      params.push(codigoEstudiante);
    }

    sql += ` ORDER BY i.fecha_atencion DESC LIMIT 100`;

    const { rows } = await query(sql, params);

    // Merge con MOCK_DATA
    const mockFiltrado = codigoEstudiante
      ? MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
      : MOCK_DATA.intervenciones;

    const idsDb = new Set(rows.map((r) => r.id));
    const mocksRestantes = mockFiltrado.filter((m) => !idsDb.has(m.id));

    const total = [...rows, ...mocksRestantes];
    res.json(total.map((i) => sanitizarIntervencion(i, req.user)));
  } catch (err) {
    console.warn("Fallo al consultar intervenciones en PostgreSQL:", err.message);
    const lista = codigoEstudiante
      ? MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
      : MOCK_DATA.intervenciones;
    res.json(lista.map((i) => sanitizarIntervencion(i, req.user)));
  }
});

// Registrar intervención en PostgreSQL
router.post("/", async (req, res, next) => {
  const { codigoEstudiante, tipoIntervencion, motivo, resumenAcuerdo, esSensibleVBG, adjuntos, canalAtencion } = req.body;

  if (!codigoEstudiante || !tipoIntervencion || !motivo || !resumenAcuerdo) {
    return res.status(400).json({ error: "Diligencie todos los campos requeridos (incluido el tipo de intervención)." });
  }

  try {
    // 1. Validar y obtener tipo de intervención
    const { rows: tipos } = await query(
      `SELECT id_tipos_intervencion, nombre FROM sat.tipos_intervencion WHERE activo = true AND nombre = $1`,
      [tipoIntervencion]
    );

    let idTipo = tipos[0]?.id_tipos_intervencion;
    if (!idTipo) {
      const { rows: todosTipos } = await query(
        `SELECT id_tipos_intervencion, nombre FROM sat.tipos_intervencion WHERE activo = true ORDER BY nombre`
      );
      const validos = todosTipos.map((r) => r.nombre);
      return res.status(400).json({
        error: `Tipo de intervención inválido. Opciones válidas: ${validos.join(", ")}.`
      });
    }

    // 2. Buscar estudiante en PostgreSQL
    let estudianteDb = null;
    try {
      const { rows: estRows } = await query(
        `SELECT id_estudiantes, codigo_externo, numero_documento FROM sat.estudiantes WHERE codigo_externo = $1 OR numero_documento = $1 OR id_estudiantes::text = $1 LIMIT 1`,
        [codigoEstudiante]
      );
      if (estRows.length > 0) {
        estudianteDb = estRows[0];
      }
    } catch {
      // Fallback
    }

    let idCaso = null;
    let idIntervencionGenerada = null;

    if (estudianteDb) {
      // Obtener o crear caso activo para el estudiante
      const { rows: casos } = await query(
        `SELECT id_casos FROM sat.casos WHERE id_estudiantes = $1 ORDER BY creado_en DESC LIMIT 1`,
        [estudianteDb.id_estudiantes]
      );

      if (casos.length > 0) {
        idCaso = casos[0].id_casos;
      } else {
        // Obtener estado 'Abierto' de sat.estados_caso
        const { rows: estados } = await query(
          `SELECT id_estados_caso FROM sat.estados_caso WHERE LOWER(nombre) = 'abierto' LIMIT 1`
        );
        const idEstadoAbierto = estados[0]?.id_estados_caso;

        const { rows: nuevoCaso } = await query(
          `INSERT INTO sat.casos
            (id_estudiantes, id_estados_caso, es_confidencialidad_especial, abierto_en, creado_en, actualizado_en)
           VALUES ($1, $2, $3, NOW(), NOW(), NOW())
           RETURNING id_casos`,
          [estudianteDb.id_estudiantes, idEstadoAbierto, !!esSensibleVBG]
        );
        idCaso = nuevoCaso[0]?.id_casos;
      }

      // Obtener id de usuario que atiende (si es UUID válido)
      const userIdValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.user?.id)
        ? req.user.id
        : null;

      let idUsuarioFinal = userIdValido;
      if (!idUsuarioFinal) {
        const { rows: adminUser } = await query(`SELECT id_usuarios FROM sat.usuarios WHERE activo = true LIMIT 1`);
        idUsuarioFinal = adminUser[0]?.id_usuarios;
      }

      const { rows: insertRes } = await query(
        `INSERT INTO sat.intervenciones
          (id_casos, id_tipos_intervencion, id_usuarios, fecha_atencion, descripcion, estado, canal_atencion, es_tutorias, cerrada_en, creado_en, actualizado_en)
         VALUES ($1, $2, $3, NOW(), $4, 'Cerrada', $5, $6, NOW(), NOW(), NOW())
         RETURNING id_intervenciones`,
        [
          idCaso,
          idTipo,
          idUsuarioFinal,
          `${motivo} - ${resumenAcuerdo}`,
          canalAtencion || "Presencial",
          tipoIntervencion.toLowerCase().includes("tutor")
        ]
      );
      idIntervencionGenerada = insertRes[0]?.id_intervenciones;
    }

    const ahora = new Date().toISOString();
    const nueva = {
      id: idIntervencionGenerada || `INT-2026-${Math.floor(100 + Math.random() * 900)}`,
      codigoEstudiante,
      atendidoPor: req.user?.nombre || "Personal Institucional",
      cargoAtendio: req.user?.cargo || "Acompañamiento",
      idUsuarioAtendio: req.user?.id,
      fecha: ahora,
      fechaRegistro: ahora,
      tipoIntervencion,
      motivo,
      resumenAcuerdo,
      adjuntos: Array.isArray(adjuntos) ? adjuntos : [],
      esSensibleVBG: !!esSensibleVBG,
      cerrado: true,
      notasAclaratorias: []
    };

    MOCK_DATA.intervenciones.unshift(nueva);
    res.status(201).json(sanitizarIntervencion(nueva, req.user));
  } catch (err) {
    next(err);
  }
});

export default router;

