/* ==========================================================================
   Feature: Alertas Tempranas
   GET  /api/alertas       -> lista de alertas
   POST /api/alertas       -> crear alerta manual
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarAlerta } from "../../shared/security/vbg.js";
import { directivoPuedeVerEstudiante, esUsuarioRestringidoAPrograma, coincidePrograma } from "../../shared/security/alcanceDirectivo.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("alertas"));

// TODO: hoy este listado NO se filtra por programa/riesgo para "directivo" -
// un Director ve alertas de TODOS los programas, no solo el suyo. Es un
// comportamiento preexistente, no cubierto por la corrección de
// directivoPuedeVerEstudiante (esa solo protege /estudiantes, /reportes/snies
// y la creación de alertas). Confirmar en la próxima reunión de equipo si
// este listado también debe recortarse al programa/riesgo del Director.
router.get("/", async (req, res, next) => {
  try {
    const alertas = [];
    const esRestringido = esUsuarioRestringidoAPrograma(req.user);
    const progUser = req.user?.programa;

    // 1. Alertas automáticas de la base de datos (Inasistencias altas en sat.matriculas_asignaturas)
    try {
      let sql = `
        SELECT e.id_estudiantes,
               e.codigo_externo AS codigo,
               COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
               COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
               COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
               COALESCE(prog.nombre, 'Programa Institucional') AS programa,
               asig.nombre AS materia,
               (COALESCE(ma.inasistencias_corte_1, 0) + COALESCE(ma.inasistencias_corte_2, 0) + COALESCE(ma.inasistencias_corte_3, 0)) AS fallas,
               ma.actualizado_en
        FROM sat.matriculas_asignaturas ma
        JOIN sat.matriculas m ON m.id_matriculas = ma.id_matriculas
        JOIN sat.estudiantes e ON e.id_estudiantes = m.id_estudiantes
        LEFT JOIN sat.personas per ON per.id = e.id_personas
        LEFT JOIN sat.programas_academicos prog ON prog.id_programas_academicos = m.id_programas_academicos
        LEFT JOIN sat.grupos_asignatura ga ON ga.id_grupos_asignatura = ma.id_grupos_asignatura
        LEFT JOIN sat.asignaturas asig ON asig.id_asignaturas = ga.id_asignaturas
        WHERE (COALESCE(ma.inasistencias_corte_1, 0) + COALESCE(ma.inasistencias_corte_2, 0) + COALESCE(ma.inasistencias_corte_3, 0)) >= 8`;
      const params = [];
      if (esRestringido && progUser) {
        sql += ` AND (LOWER(COALESCE(prog.nombre, '')) ILIKE '%' || LOWER($1) || '%')`;
        params.push(progUser);
      }
      sql += ` ORDER BY fallas DESC LIMIT 20`;
      const { rows } = await query(sql, params);

      rows.forEach((r, idx) => {
        alertas.push({
          id: `ALT-AUTO-${r.codigo}-${idx + 1}`,
          codigoEstudiante: r.codigo,
          documentoEstudiante: r.documento,
          nombreEstudiante: `${r.nombres} ${r.apellidos}`,
          programa: r.programa,
          tipo: "Académica / Asistencia",
          categoria: "Automática",
          nivelRiesgo: r.fallas >= 12 ? "Alto" : "Medio",
          descripcion: `Acumula ${r.fallas} inasistencias en la asignatura "${r.materia}" en el periodo 2026-1.`,
          fechaCreacion: r.actualizado_en ? new Date(r.actualizado_en).toISOString() : new Date().toISOString(),
          creador: "Sistema de Alertas Tempranas (Automático)",
          estado: "Abierta",
          esVBG: false
        });
      });
    } catch (dbErr) {
      console.warn("Error cargando alertas automáticas de BD:", dbErr.message);
    }

    // 2. Complementar con alertas manuales en memoria (MOCK_DATA) filtradas por programa si aplica
    MOCK_DATA.alertas.forEach((m) => {
      if (
        !esRestringido ||
        coincidePrograma(m.programa, progUser) ||
        (m.creador && req.user?.nombre && m.creador.toLowerCase().includes(req.user.nombre.toLowerCase()))
      ) {
        alertas.push(m);
      }
    });

    res.json(alertas.map((a) => sanitizarAlerta(a, req.user)));
  } catch (err) {
    next(err);
  }
});

// Espeja crearAlertaManual(): registra alerta y la asocia al estudiante real
router.post("/", async (req, res, next) => {
  try {
    const { codigoEstudiante, tipo, nivelRiesgo, descripcion, fechaManual, fechaCreacion } = req.body;

    if (!codigoEstudiante || !tipo || !nivelRiesgo || !descripcion) {
      return res.status(400).json({ error: "Complete todos los campos requeridos." });
    }

    const cleanId = String(codigoEstudiante).trim();
    let estudiante = null;

    // 1. Buscar en sat.estudiantes + sat.personas + sat.matriculas
    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes AS id,
                e.codigo_externo AS codigo,
                COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
                COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
                COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
                COALESCE(p.nombre, 'Programa Institucional') AS programa
         FROM sat.estudiantes e
         LEFT JOIN sat.personas per ON per.id = e.id_personas
         LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
         WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR per.numero_identificacion = $1 OR m.codigo_externo = $1 OR e.id_estudiantes::text = $1
         LIMIT 1`,
        [cleanId]
      );
      if (rows.length > 0) {
        estudiante = rows[0];
      }
    } catch (dbErr) {
      console.warn("Consulta sat.estudiantes en alertas falló:", dbErr.message);
    }

    // 2. Fallback a MOCK_DATA
    if (!estudiante) {
      estudiante = MOCK_DATA.estudiantes.find(
        (e) => e.codigo.toLowerCase() === cleanId.toLowerCase() || e.documento?.toLowerCase() === cleanId.toLowerCase()
      );
    }

    if (esUsuarioRestringidoAPrograma(req.user)) {
      if (!estudiante || !coincidePrograma(estudiante.programa, req.user.programa)) {
        return res.status(403).json({
          error: `Seguridad SAT: Su perfil solo tiene acceso para registrar alertas de estudiantes de su programa académico (${req.user.programa}).`
        });
      }
    } else if (req.user.rol === "directivo" && (!estudiante || !directivoPuedeVerEstudiante(req.user, estudiante))) {
      return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
    }

    const codigoFinal = estudiante ? estudiante.codigo : cleanId;
    const nombreFinal = estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : cleanId;
    const programaFinal = estudiante ? estudiante.programa : "No especificado";

    const nuevaAlerta = {
      id: `ALT-2026-${Math.floor(100 + Math.random() * 900)}`,
      codigoEstudiante: codigoFinal,
      documentoEstudiante: estudiante?.documento || "",
      nombreEstudiante: nombreFinal,
      programa: programaFinal,
      tipo,
      categoria: "Manual",
      nivelRiesgo,
      descripcion,
      fechaCreacion: (() => {
        const fechaRef = fechaManual || fechaCreacion;
        if (fechaRef) {
          if (typeof fechaRef === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaRef)) {
            const [y, m, d] = fechaRef.split("-").map(Number);
            const now = new Date();
            const fechaObj = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
            return fechaObj.toISOString();
          }
          const parsed = new Date(fechaRef);
          if (!isNaN(parsed.getTime())) return parsed.toISOString();
        }
        return new Date().toISOString();
      })(),
      creador: `${req.user.nombre} (${req.user.cargo})`,
      estado: "Abierta",
      esVBG: tipo.includes("VBG") || tipo.includes("Género")
    };

    MOCK_DATA.alertas.unshift(nuevaAlerta);
    res.status(201).json(sanitizarAlerta(nuevaAlerta, req.user));
  } catch (err) {
    next(err);
  }
});

export default router;

