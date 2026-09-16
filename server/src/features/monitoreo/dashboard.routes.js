/* ==========================================================================
   Feature: Monitoreo (Tablero General - sección "Monitoreo" del menú)
   GET /api/dashboard                    -> estadísticas para el tablero general
   GET /api/dashboard/riesgo-dimensiones -> conteo de riesgo Alto/Medio/Bajo
                                             por dimensión, agregado de la BD
                                             y caracterizaciones registradas.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("dashboard"));

// Obtiene la lista completa de estudiantes combinando la Base de Datos PostgreSQL y MOCK_DATA
async function obtenerEstudiantesCombinados() {
  let estudiantes = [];

  try {
    const { rows } = await query(`
      SELECT e.id_estudiantes AS id,
             e.codigo_externo AS codigo,
             e.numero_documento AS documento,
             e.nombres,
             e.apellidos,
             COALESCE(e.semestre_actual, 1) AS semestre,
             COALESCE(p.nombre, 'Ingeniería de Sistemas') AS programa,
             COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
             EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
      FROM sat.estudiantes e
      LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
      LEFT JOIN LATERAL (
        SELECT cr_1.id_rangos_riesgo
        FROM sat.calificaciones_riesgo cr_1
        WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
        ORDER BY cr_1.calculado_en DESC LIMIT 1
      ) cr ON true
      LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
    `);
    estudiantes = rows.map((r) => {
      let riesgo = r.riesgoGlobal;
      if (riesgo === "ALTO") riesgo = "Alto";
      else if (riesgo === "MEDIO") riesgo = "Medio";
      else if (riesgo === "BAJO") riesgo = "Bajo";

      return {
        id: r.id,
        codigo: r.codigo,
        documento: r.documento,
        nombres: r.nombres,
        apellidos: r.apellidos,
        semestre: Number(r.semestre) || 1,
        programa: r.programa,
        riesgoGlobal: riesgo,
        encuestaRespondida: Boolean(r.encuestaRespondida)
      };
    });
  } catch (err) {
    console.warn("Error al consultar sat.estudiantes para dashboard:", err.message);
  }

  // Complementar con MOCK_DATA
  const codigosExistentes = new Set(estudiantes.map((e) => e.codigo));
  MOCK_DATA.estudiantes.forEach((m) => {
    if (!codigosExistentes.has(m.codigo)) {
      estudiantes.push({
        id: `est_${m.codigo}`,
        codigo: m.codigo,
        documento: m.documento,
        nombres: m.nombres,
        apellidos: m.apellidos,
        semestre: Number(m.semestre) || 1,
        programa: m.programa,
        riesgoGlobal: m.riesgoGlobal || (m.encuestaRespondida ? "Medio" : "Sin evaluar"),
        encuestaRespondida: Boolean(m.encuestaRespondida)
      });
    }
  });

  return estudiantes;
}

// Obtiene la agregación de dimensiones de riesgo combinando DB y MOCK_DATA
async function obtenerDimensionesAgregadas(programa = null) {
  const dimensiones = {
    IND: { Alto: 0, Medio: 0, Bajo: 0 },
    INS: { Alto: 0, Medio: 0, Bajo: 0 },
    ACA: { Alto: 0, Medio: 0, Bajo: 0 },
    SOC: { Alto: 0, Medio: 0, Bajo: 0 },
    GEST_PROG: { Alto: 0, Medio: 0, Bajo: 0 }
  };
  let totalEnvios = 0;

  try {
    let sql = `
      SELECT cr.id_calificaciones_riesgo, cr.id_estudiantes, cr.factores, rr.nombre AS riesgo_global, COALESCE(p.nombre, '') AS programa
      FROM sat.calificaciones_riesgo cr
      LEFT JOIN sat.estudiantes e ON cr.id_estudiantes = e.id_estudiantes
      LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
      LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
      WHERE cr.vigente = true
    `;
    const params = [];
    if (programa && programa !== "Todos") {
      sql += ` AND LOWER(COALESCE(p.nombre, '')) = LOWER($1)`;
      params.push(programa);
    }

    const { rows: califRows } = await query(sql, params);

    califRows.forEach((c) => {
      let fact = typeof c.factores === "string" ? JSON.parse(c.factores) : c.factores || {};
      let dims = fact.dimensiones || fact.porDimension || {};
      let conto = false;
      Object.entries(dims).forEach(([dim, val]) => {
        const dimKey = dim === "GEST PROG" ? "GEST_PROG" : dim;
        if (dimensiones[dimKey] && val && val.riesgo) {
          const r =
            val.riesgo === "Alto" || val.riesgo === "ALTO"
              ? "Alto"
              : val.riesgo === "Bajo" || val.riesgo === "BAJO"
              ? "Bajo"
              : "Medio";
          dimensiones[dimKey][r] += 1;
          conto = true;
        }
      });
      if (conto) totalEnvios++;
    });
  } catch (err) {
    console.warn("Error agregando calificaciones de DB:", err.message);
  }

  // Complementar con MOCK_DATA.caracterizaciones
  const mockEnvios = !programa || programa === "Todos"
    ? MOCK_DATA.caracterizaciones
    : MOCK_DATA.caracterizaciones.filter((c) => {
        const est = MOCK_DATA.estudiantes.find((e) => e.codigo === c.codigoEstudiante);
        return est && est.programa.toLowerCase() === programa.toLowerCase();
      });

  mockEnvios.forEach((envio) => {
    if (envio.porDimension) {
      let conto = false;
      Object.entries(envio.porDimension).forEach(([dim, val]) => {
        const dimKey = dim === "GEST PROG" ? "GEST_PROG" : dim;
        if (dimensiones[dimKey] && val && val.riesgo) {
          const r =
            val.riesgo === "Alto" || val.riesgo === "ALTO"
              ? "Alto"
              : val.riesgo === "Bajo" || val.riesgo === "BAJO"
              ? "Bajo"
              : "Medio";
          dimensiones[dimKey][r] += 1;
          conto = true;
        }
      });
      if (conto) totalEnvios++;
    }
  });

  return { dimensiones, totalEnvios };
}

// GET /api/dashboard
router.get("/", async (req, res, next) => {
  try {
    const { rol, nombre, programa } = req.user;
    const periodoActual = "2025 II";
    const estudiantes = await obtenerEstudiantesCombinados();

    // ---- Directivo: todo recortado a su programa ---------------------------
    if (rol === "directivo") {
      const alumnos = estudiantes.filter(
        (e) => e.programa.toLowerCase() === (programa || "ingeniería de sistemas").toLowerCase()
      );
      const encuestados = alumnos.filter((e) => e.encuestaRespondida).length;
      const alertasAbiertas = MOCK_DATA.alertas.filter(
        (a) => a.programa.toLowerCase() === (programa || "").toLowerCase() && a.estado !== "Cerrada"
      ).length;

      return res.json({
        vista: "programa",
        periodoActual,
        programa: programa || "Ingeniería de Sistemas",
        kpis: {
          estudiantesPrograma: alumnos.length,
          encuestadosPrograma: encuestados,
          faltantesPrograma: alumnos.length - encuestados,
          riesgoAltoPrograma: alumnos.filter((e) => e.riesgoGlobal === "Alto").length,
          alertasAbiertasPrograma: alertasAbiertas
        }
      });
    }

    // ---- Profesional: su bandeja de casos --------------------------------
    if (rol === "profesional") {
      const misIntervenciones = MOCK_DATA.intervenciones
        .filter((i) => i.atendidoPor === nombre)
        .map((i) => sanitizarIntervencion(i, req.user));
      const misRemisiones = MOCK_DATA.remisiones.filter((r) => r.profesionalAsignado === nombre);

      return res.json({
        vista: "profesional",
        periodoActual,
        usuario: nombre,
        misIntervenciones,
        misRemisiones,
        resumen: {
          intervencionesTotal: misIntervenciones.length,
          intervencionesAbiertas: misIntervenciones.filter((i) => !i.cerrado).length,
          remisionesTotal: misRemisiones.length,
          remisionesPendientes: misRemisiones.filter((r) => r.estado !== "Atendida").length
        }
      });
    }

    // ---- Reporte de actividades: tablero por definir ---------------------
    if (rol === "reporte_actividades") {
      return res.json({
        vista: "actividades-pendiente",
        periodoActual,
        mensaje:
          "El tablero de actividades para este rol aún no está definido. " +
          "Su alcance (qué indicadores de actividades registradas mostrar) se " +
          "debe acordar con el dueño de producto."
      });
    }

    // ---- Admin: vista institucional con datos reales ---------------------
    if (rol === "admin") {
      const totalMatriculados = estudiantes.length;
      const encuestados = estudiantes.filter((e) => e.encuestaRespondida);
      const totalEncuestados = encuestados.length;
      const totalFaltantes = totalMatriculados - totalEncuestados;

      const distribucionRiesgo = {
        bajo: estudiantes.filter((e) => e.riesgoGlobal === "Bajo").length,
        medio: estudiantes.filter((e) => e.riesgoGlobal === "Medio").length,
        alto: estudiantes.filter((e) => e.riesgoGlobal === "Alto").length
      };

      const porSemestre = {
        semestre1: {
          total: estudiantes.filter((e) => e.semestre === 1).length,
          encuestados: estudiantes.filter((e) => e.semestre === 1 && e.encuestaRespondida).length,
          faltantes: estudiantes.filter((e) => e.semestre === 1 && !e.encuestaRespondida).length,
          riesgoAlto: estudiantes.filter((e) => e.semestre === 1 && e.riesgoGlobal === "Alto").length
        },
        semestre4: {
          total: estudiantes.filter((e) => e.semestre === 4).length,
          encuestados: estudiantes.filter((e) => e.semestre === 4 && e.encuestaRespondida).length,
          faltantes: estudiantes.filter((e) => e.semestre === 4 && !e.encuestaRespondida).length,
          riesgoAlto: estudiantes.filter((e) => e.semestre === 4 && e.riesgoGlobal === "Alto").length
        },
        semestre7: {
          total: estudiantes.filter((e) => e.semestre === 7).length,
          encuestados: estudiantes.filter((e) => e.semestre === 7 && e.encuestaRespondida).length,
          faltantes: estudiantes.filter((e) => e.semestre === 7 && !e.encuestaRespondida).length,
          riesgoAlto: estudiantes.filter((e) => e.semestre === 7 && e.riesgoGlobal === "Alto").length
        }
      };

      return res.json({
        vista: "institucional",
        periodoActual,
        totalEstudiantesMatriculados: totalMatriculados,
        totalEncuestadosCaracterizacion: totalEncuestados,
        totalFaltantesCaracterizacion: totalFaltantes,
        distribucionRiesgo,
        porSemestre
      });
    }

    // ---- Cualquier otro rol ---------------------------------------------
    res.json({
      vista: "no-configurada",
      periodoActual,
      mensaje:
        "El Tablero General todavía no tiene una vista definida para tu rol. " +
        "Solicita al equipo del SAT que configure qué indicadores te corresponden."
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/riesgo-dimensiones
router.get("/riesgo-dimensiones", async (req, res, next) => {
  try {
    const { rol, programa } = req.user;
    const progFiltro = rol === "directivo" ? programa : null;
    const resultado = await obtenerDimensionesAgregadas(progFiltro);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

export default router;

