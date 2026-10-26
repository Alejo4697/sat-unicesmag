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
             COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
             COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
             COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
             COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
             COALESCE(p.nombre, 'Programa Institucional') AS programa,
             COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
             EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
      FROM sat.estudiantes e
      LEFT JOIN sat.personas per ON per.id = e.id_personas
      LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
      LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
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
    const { rol, nombre, programa, cargo } = req.user;
    const cargoLower = String(cargo || "").toLowerCase();
    const esDocenteAcompanante = cargoLower.includes("docente acompaña") || cargoLower.includes("docente tutor");
    const esCoordinadorAcompanamiento = cargoLower.includes("coordinador de acompañamiento") || cargoLower.includes("coordinadora de acompañamiento");
    const periodoActual = "2025 II";
    const estudiantes = await obtenerEstudiantesCombinados();

    // ---- Coordinador de Acompañamiento o Admin: vista institucional completa ---
    if (rol === "admin" || esCoordinadorAcompanamiento) {
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

    // ---- Docente Acompañante o Directivo: todo recortado a su programa ----
    if (rol === "directivo" || esDocenteAcompanante) {
      const programaTarget = programa || "Ingeniería de Sistemas";
      const alumnos = estudiantes.filter(
        (e) => e.programa.toLowerCase() === programaTarget.toLowerCase()
      );
      const encuestados = alumnos.filter((e) => e.encuestaRespondida).length;
      const alertasAbiertas = MOCK_DATA.alertas.filter(
        (a) => a.programa.toLowerCase() === programaTarget.toLowerCase() && a.estado !== "Cerrada"
      ).length;

      return res.json({
        vista: "programa",
        periodoActual,
        programa: programaTarget,
        esDocenteAcompanante: Boolean(esDocenteAcompanante),
        kpis: {
          estudiantesPrograma: alumnos.length,
          encuestadosPrograma: encuestados,
          faltantesPrograma: alumnos.length - encuestados,
          riesgoAltoPrograma: alumnos.filter((e) => e.riesgoGlobal === "Alto").length,
          alertasAbiertasPrograma: alertasAbiertas
        }
      });
    }

    // ---- Profesional asistencial general: su bandeja de casos --------------------------------
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

// GET /api/dashboard/resultados-caracterizacion
// Resultados y avances de la encuesta de permanencia / caracterización
// Accesible para: Admin, Coordinador de Acompañamiento, Docente Acompañante y Directivos
router.get("/resultados-caracterizacion", async (req, res, next) => {
  try {
    const rol = req.user?.rol;
    const cargo = String(req.user?.cargo || "").toLowerCase();
    const esAdmin = rol === "admin";
    const esCoordinador = esAdmin || cargo.includes("coordinador de acompañamiento") || cargo.includes("coordinadora de acompañamiento");
    const esDocenteAcompanante = cargo.includes("docente acompaña") || cargo.includes("docente tutor");
    const esDirectivo = rol === "directivo";

    if (!esAdmin && !esCoordinador && !esDocenteAcompanante && !esDirectivo) {
      return res.status(403).json({
        error: "Acceso denegado. Los resultados de la encuesta solo están autorizados para Administrador, Coordinador de Acompañamiento y Docente Acompañante."
      });
    }

    // Restricción por rol de programa: si es Docente Acompañante o Directivo sin rol institucional
    const esRestringido = (esDocenteAcompanante || esDirectivo) && !esCoordinador && !esAdmin;
    const programaUsuario = req.user?.programa || null;

    // Filtros recibidos
    const filtroPeriodo = req.query.periodo || "todos";
    const filtroSemestre = req.query.semestre || "todos";
    const filtroCampo = req.query.campo || "todos"; // 'todos', 'IND', 'INS', 'ACA', 'SOC'
    let filtroPrograma = req.query.programa || "todos";
    const busqueda = (req.query.q || "").trim().toLowerCase();

    if (esRestringido && programaUsuario) {
      filtroPrograma = programaUsuario;
    }

    // Consultar todos los estudiantes con sus calificaciones y respuestas de BD
    let estudiantes = [];
    try {
      const { rows } = await query(`
        SELECT 
          e.id_estudiantes AS id,
          e.codigo_externo AS codigo,
          COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
          COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
          COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
          COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
          COALESCE(p.nombre, 'Programa Institucional') AS programa,
          COALESCE(pa.nombre, '2025-2') AS periodo,
          rc.id_respuestas_caracterizacion,
          rc.creado_en AS fecha_encuesta,
          CASE WHEN rc.id_respuestas_caracterizacion IS NOT NULL THEN 'RESPONDIDA' ELSE 'PENDIENTE' END AS estado_encuesta,
          COALESCE(rr.nombre, 'Sin evaluar') AS riesgo_global,
          cr.puntaje_global,
          cr.factores
        FROM sat.estudiantes e
        LEFT JOIN sat.personas per ON per.id = e.id_personas
        LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
        LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
        LEFT JOIN sat.respuestas_caracterizacion rc ON rc.id_estudiantes = e.id_estudiantes
        LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = rc.id_periodos_academicos
        LEFT JOIN LATERAL (
          SELECT cr_1.id_rangos_riesgo, cr_1.puntaje_global, cr_1.factores
          FROM sat.calificaciones_riesgo cr_1
          WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
          ORDER BY cr_1.calculado_en DESC LIMIT 1
        ) cr ON true
        LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
      `);

      estudiantes = rows.map((r) => {
        let factoresParsed = {};
        if (typeof r.factores === "string") {
          try { factoresParsed = JSON.parse(r.factores); } catch {}
        } else if (r.factores && typeof r.factores === "object") {
          factoresParsed = r.factores;
        }

        const porDim = factoresParsed.porDimension || factoresParsed.dimensiones || {};
        const tieneResp = r.estado_encuesta === "RESPONDIDA";

        const alertInd = porDim.IND?.riesgo || (tieneResp ? "Medio" : "N/A");
        const alertIns = porDim.INS?.riesgo || (tieneResp ? "Medio" : "N/A");
        const alertAca = porDim.ACA?.riesgo || (tieneResp ? "Medio" : "N/A");
        const alertSoc = porDim.SOC?.riesgo || (tieneResp ? "Medio" : "N/A");

        let riesgo = r.riesgo_global;
        if (riesgo === "ALTO") riesgo = "Alto";
        else if (riesgo === "MEDIO") riesgo = "Medio";
        else if (riesgo === "BAJO") riesgo = "Bajo";
        else if (!riesgo || riesgo === "Sin evaluar") riesgo = tieneResp ? "Medio" : "Sin evaluar";

        const nombreCompleto = `${r.nombres || ""} ${r.apellidos || ""}`.trim();
        const tieneAlerta = riesgo === "Alto" || riesgo === "Medio" ||
          alertInd === "Alto" || alertIns === "Alto" || alertAca === "Alto" || alertSoc === "Alto";

        return {
          id: r.id,
          codigo: r.codigo,
          documento: r.documento,
          nombres: r.nombres,
          apellidos: r.apellidos,
          nombreCompleto,
          semestre: Number(r.semestre) || 1,
          programa: r.programa,
          periodo: r.periodo,
          fechaEncuesta: r.fecha_encuesta,
          estadoEncuesta: r.estado_encuesta,
          riesgoGlobal: riesgo,
          puntajeGlobal: r.puntaje_global ? Number(r.puntaje_global) : null,
          alertaIndividual: alertInd,
          alertaAsistencial: alertIns,
          alertaAcademica: alertAca,
          alertaSocioeconomica: alertSoc,
          porDimension: porDim,
          tieneAlerta
        };
      });
    } catch (err) {
      console.warn("Fallo al consultar estudiantes para resultados de caracterización:", err.message);
    }

    // Complementar con MOCK_DATA
    const codigosExistentes = new Set(estudiantes.map((e) => e.codigo));
    MOCK_DATA.estudiantes.forEach((m) => {
      if (!codigosExistentes.has(m.codigo)) {
        const caracMock = MOCK_DATA.caracterizaciones.find((c) => c.codigoEstudiante === m.codigo);
        const porDim = caracMock?.porDimension || {};
        const tieneResp = Boolean(m.encuestaRespondida || caracMock);
        const riesgo = m.riesgoGlobal || (tieneResp ? "Medio" : "Sin evaluar");

        estudiantes.push({
          id: `est_${m.codigo}`,
          codigo: m.codigo,
          documento: m.documento,
          nombres: m.nombres,
          apellidos: m.apellidos,
          nombreCompleto: `${m.nombres || ""} ${m.apellidos || ""}`.trim(),
          semestre: Number(m.semestre) || 1,
          programa: m.programa,
          periodo: m.periodo || "2025 II",
          fechaEncuesta: caracMock?.fecha || null,
          estadoEncuesta: tieneResp ? "RESPONDIDA" : "PENDIENTE",
          riesgoGlobal: riesgo,
          puntajeGlobal: m.puntajeRiesgo || (caracMock ? caracMock.promedioGlobal * 25 : null),
          alertaIndividual: porDim.IND?.riesgo || (tieneResp ? "Medio" : "N/A"),
          alertaAsistencial: porDim.INS?.riesgo || (tieneResp ? "Medio" : "N/A"),
          alertaAcademica: porDim.ACA?.riesgo || (tieneResp ? "Medio" : "N/A"),
          alertaSocioeconomica: porDim.SOC?.riesgo || (tieneResp ? "Medio" : "N/A"),
          porDimension: porDim,
          tieneAlerta: riesgo === "Alto" || riesgo === "Medio"
        });
      }
    });

    // Catálogos únicos disponibles
    const programasDisponibles = Array.from(
      new Set(estudiantes.map((e) => e.programa).filter(Boolean))
    ).sort();

    const periodosDisponibles = ["2026-1", "2025-2", "2025-1", "2024-2", "2023-II"];

    // -------------------------------------------------------------
    // Filtrado Dinámico
    // -------------------------------------------------------------
    let filtrados = estudiantes;

    // Filtro Programa
    if (filtroPrograma && filtroPrograma !== "todos") {
      filtrados = filtrados.filter(
        (e) => e.programa.toLowerCase() === filtroPrograma.toLowerCase()
      );
    }

    // Filtro Semestre (1, 4, 7 o número específico)
    if (filtroSemestre && filtroSemestre !== "todos") {
      const semNum = Number(filtroSemestre);
      filtrados = filtrados.filter((e) => e.semestre === semNum);
    }

    // Filtro Periodo
    if (filtroPeriodo && filtroPeriodo !== "todos") {
      filtrados = filtrados.filter((e) => {
        const pNorm = String(e.periodo || "").replace(" II", "-2").replace(" I", "-1");
        const fNorm = String(filtroPeriodo).replace(" II", "-2").replace(" I", "-1");
        return pNorm.toLowerCase() === fNorm.toLowerCase() || e.estadoEncuesta === "PENDIENTE";
      });
    }

    // Filtro Campo / Dimensión de Preguntas
    if (filtroCampo && filtroCampo !== "todos") {
      filtrados = filtrados.filter((e) => {
        if (e.estadoEncuesta !== "RESPONDIDA") return false;
        if (filtroCampo === "IND") return e.alertaIndividual === "Alto" || e.alertaIndividual === "Medio";
        if (filtroCampo === "INS") return e.alertaAsistencial === "Alto" || e.alertaAsistencial === "Medio";
        if (filtroCampo === "ACA") return e.alertaAcademica === "Alto" || e.alertaAcademica === "Medio";
        if (filtroCampo === "SOC") return e.alertaSocioeconomica === "Alto" || e.alertaSocioeconomica === "Medio";
        return true;
      });
    }

    // Búsqueda por texto (cédula, código, nombre)
    if (busqueda) {
      filtrados = filtrados.filter(
        (e) =>
          e.codigo?.toLowerCase().includes(busqueda) ||
          e.documento?.toLowerCase().includes(busqueda) ||
          e.nombreCompleto?.toLowerCase().includes(busqueda)
      );
    }

    // -------------------------------------------------------------
    // Cálculo de Métricas y KPIs
    // -------------------------------------------------------------
    const totalEstudiantes = filtrados.length;
    const encuestados = filtrados.filter((e) => e.estadoEncuesta === "RESPONDIDA").length;
    const faltantes = totalEstudiantes - encuestados;
    const porcentajeAvance = totalEstudiantes > 0 ? Number(((encuestados / totalEstudiantes) * 100).toFixed(1)) : 0;
    const alertasPermanencia = filtrados.filter((e) => e.tieneAlerta).length;

    // Distribución por nivel de riesgo global
    const distribucionRiesgo = {
      alto: filtrados.filter((e) => e.riesgoGlobal === "Alto").length,
      medio: filtrados.filter((e) => e.riesgoGlobal === "Medio").length,
      bajo: filtrados.filter((e) => e.riesgoGlobal === "Bajo").length,
      sinEvaluar: filtrados.filter((e) => e.riesgoGlobal === "Sin evaluar").length
    };

    // Semaforización por campos de riesgo (IND, INS, ACA, SOC)
    const respondidos = filtrados.filter((e) => e.estadoEncuesta === "RESPONDIDA");
    const distribucionPorDimension = {
      IND: {
        Alto: respondidos.filter((e) => e.alertaIndividual === "Alto").length,
        Medio: respondidos.filter((e) => e.alertaIndividual === "Medio").length,
        Bajo: respondidos.filter((e) => e.alertaIndividual === "Bajo").length
      },
      INS: {
        Alto: respondidos.filter((e) => e.alertaAsistencial === "Alto").length,
        Medio: respondidos.filter((e) => e.alertaAsistencial === "Medio").length,
        Bajo: respondidos.filter((e) => e.alertaAsistencial === "Bajo").length
      },
      ACA: {
        Alto: respondidos.filter((e) => e.alertaAcademica === "Alto").length,
        Medio: respondidos.filter((e) => e.alertaAcademica === "Medio").length,
        Bajo: respondidos.filter((e) => e.alertaAcademica === "Bajo").length
      },
      SOC: {
        Alto: respondidos.filter((e) => e.alertaSocioeconomica === "Alto").length,
        Medio: respondidos.filter((e) => e.alertaSocioeconomica === "Medio").length,
        Bajo: respondidos.filter((e) => e.alertaSocioeconomica === "Bajo").length
      }
    };

    // Cobertura por semestres focalizados (1, 4, 7)
    const porSemestre = {
      semestre1: {
        total: filtrados.filter((e) => e.semestre === 1).length,
        encuestados: filtrados.filter((e) => e.semestre === 1 && e.estadoEncuesta === "RESPONDIDA").length,
        faltantes: filtrados.filter((e) => e.semestre === 1 && e.estadoEncuesta === "PENDIENTE").length,
        riesgoAlto: filtrados.filter((e) => e.semestre === 1 && e.riesgoGlobal === "Alto").length
      },
      semestre4: {
        total: filtrados.filter((e) => e.semestre === 4).length,
        encuestados: filtrados.filter((e) => e.semestre === 4 && e.estadoEncuesta === "RESPONDIDA").length,
        faltantes: filtrados.filter((e) => e.semestre === 4 && e.estadoEncuesta === "PENDIENTE").length,
        riesgoAlto: filtrados.filter((e) => e.semestre === 4 && e.riesgoGlobal === "Alto").length
      },
      semestre7: {
        total: filtrados.filter((e) => e.semestre === 7).length,
        encuestados: filtrados.filter((e) => e.semestre === 7 && e.estadoEncuesta === "RESPONDIDA").length,
        faltantes: filtrados.filter((e) => e.semestre === 7 && e.estadoEncuesta === "PENDIENTE").length,
        riesgoAlto: filtrados.filter((e) => e.semestre === 7 && e.riesgoGlobal === "Alto").length
      }
    };

    res.json({
      periodoActual: filtroPeriodo !== "todos" ? filtroPeriodo : "2025-2",
      programaSeleccionado: filtroPrograma,
      semestreSeleccionado: filtroSemestre,
      campoSeleccionado: filtroCampo,
      metadatos: {
        esRestringido,
        programaUsuario,
        programasDisponibles,
        periodosDisponibles
      },
      kpis: {
        totalEstudiantes,
        encuestados,
        faltantes,
        porcentajeAvance,
        alertasPermanencia
      },
      distribucionRiesgo,
      distribucionPorDimension,
      porSemestre,
      estudiantes: filtrados.slice(0, 300) // Máximo 300 filas para fluidez en UI y exportación
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

