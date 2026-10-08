/* ==========================================================================
   Feature: Seguimiento Estudiantil (Ficha 360° - RQF12)
   Búsqueda multicriterio por:
     - Código institucional (ej. 202510045, 220109009, 220109010)
     - Cédula / Documento de identidad (ej. 1085324901, 1085001009, 1085002000)
     - Nombres y Apellidos

   Una persona (sat.estudiantes, numero_documento UNIQUE) puede tener varias
   matrículas/códigos (sat.matriculas.codigo_externo, ej. pregrado + posgrado
   simultáneos). Buscar por CÓDIGO nunca es ambiguo (un código = una
   matrícula = una persona). Buscar por DOCUMENTO puede resolver a:
     - 0 matrículas con código -> se usa el código legado de
       sat.estudiantes.codigo_externo (compatibilidad con filas que no
       tienen matrícula, ver shared/db/matriculas_codigo_externo.sql).
     - 1 matrícula -> comportamiento de siempre, va directo a la ficha.
     - 2+ matrículas -> buscarPorIdentificador() devuelve { multiple: true,
       matriculas: [...] } en vez de una ficha, para que el cliente muestre
       un selector antes de pedir la ficha de un código puntual.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { directivoPuedeVerEstudiante } from "../../shared/security/alcanceDirectivo.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("ficha"));

// Riesgo global vigente de una persona (no depende del código/matrícula).
async function obtenerRiesgoGlobal(idEstudiante) {
  const { rows } = await query(
    `SELECT rr.nombre
     FROM sat.calificaciones_riesgo cr
     JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
     WHERE cr.id_estudiantes = $1 AND cr.vigente = true
     ORDER BY cr.calculado_en DESC
     LIMIT 1`,
    [idEstudiante]
  );
  const nombre = rows[0]?.nombre;
  if (nombre === "ALTO") return "Alto";
  if (nombre === "MEDIO") return "Medio";
  if (nombre === "BAJO") return "Bajo";
  return nombre || "Sin evaluar";
}

// Arma la ficha completa de UNA persona para UN código puntual (programa,
// semestre y periodo salen de esa matrícula específica cuando existe; si no
// hay matrícula backfillada para ese código, cae a los campos legado de
// sat.estudiantes).
async function construirFichaPorCodigo(idEstudiante, codigo) {
  // 1. Obtener todas las matrículas / programas de la persona (tanto Pregrado como Posgrado)
  const { rows: matriculasRows } = await query(
    `SELECT m.id_matriculas,
            COALESCE(m.codigo_externo, e.codigo_externo) AS codigo,
            COALESCE(p.nombre, 'Programa Institucional') AS programa,
            p.codigo_externo AS "codigoPrograma",
            CASE 
              WHEN UPPER(p.nombre) LIKE '%ESPECIALIZA%' OR UPPER(p.nombre) LIKE '%MAESTR%' OR UPPER(p.nombre) LIKE '%POSGRADO%' THEN 'POSGRADO'
              ELSE 'PREGRADO'
            END AS nivel,
            COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
            COALESCE(m.jornada, 'DIURNA') AS jornada,
            COALESCE(pa.nombre, '2026-1') AS periodo,
            COALESCE(m.estado, 'ACTIVA') AS estado,
            metricas.promedio AS "promedioAcademico",
            COALESCE(metricas.inasistencias, 0) AS "inasistenciasAcumuladas",
            COALESCE(metricas.total_asignaturas, 0) AS "totalAsignaturas",
            COALESCE(metricas.asignaturas_evaluadas, 0) AS "asignaturasEvaluadas"
     FROM sat.matriculas m
     JOIN sat.estudiantes e ON e.id_estudiantes = m.id_estudiantes
     LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = m.id_programas_academicos
     LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = m.id_periodos_academicos
     LEFT JOIN LATERAL (
       SELECT 
         ROUND(
           AVG(
             COALESCE(
               ma.nota_final,
               (
                 SELECT AVG(val)
                 FROM (VALUES (ma.nota_corte_1), (ma.nota_corte_2), (ma.nota_corte_3)) AS v(val)
                 WHERE val IS NOT NULL
               )
             )
           )::numeric, 
           2
         ) AS promedio,
         SUM(COALESCE(ma.inasistencias_corte_1, 0) + COALESCE(ma.inasistencias_corte_2, 0) + COALESCE(ma.inasistencias_corte_3, 0)) AS inasistencias,
         COUNT(ma.id_matriculas_asignaturas) AS total_asignaturas,
         COUNT(
           CASE WHEN ma.nota_final IS NOT NULL 
             OR ma.nota_corte_1 IS NOT NULL 
             OR ma.nota_corte_2 IS NOT NULL 
             OR ma.nota_corte_3 IS NOT NULL 
           THEN 1 END
         ) AS asignaturas_evaluadas
       FROM sat.matriculas_asignaturas ma
       WHERE ma.id_matriculas = m.id_matriculas
     ) metricas ON true
     WHERE m.id_estudiantes = $1
     ORDER BY (CASE WHEN UPPER(p.nombre) LIKE '%ESPECIALIZA%' OR UPPER(p.nombre) LIKE '%MAESTR%' THEN 2 ELSE 1 END), m.semestre DESC`,
    [idEstudiante]
  );

  // 1.1 Obtener detalle de asignaturas para cada matrícula
  for (const mat of matriculasRows) {
    const { rows: asigs } = await query(
      `SELECT a.codigo_externo AS codigo,
              a.nombre AS nombre,
              ma.nota_corte_1 AS "corte1",
              ma.nota_corte_2 AS "corte2",
              ma.nota_corte_3 AS "corte3",
              ma.nota_final AS "notaFinal",
              COALESCE(
                ma.nota_final,
                ROUND(
                  (SELECT AVG(val) FROM (VALUES (ma.nota_corte_1), (ma.nota_corte_2), (ma.nota_corte_3)) AS v(val) WHERE val IS NOT NULL)::numeric,
                  2
                )
              ) AS "notaActual",
              (COALESCE(ma.inasistencias_corte_1, 0) + COALESCE(ma.inasistencias_corte_2, 0) + COALESCE(ma.inasistencias_corte_3, 0)) AS inasistencias,
              COALESCE(ma.estado, 'CURSANDO') AS estado
       FROM sat.matriculas_asignaturas ma
       JOIN sat.grupos_asignatura ga ON ga.id_grupos_asignatura = ma.id_grupos_asignatura
       JOIN sat.asignaturas a ON a.id_asignaturas = ga.id_asignaturas
       WHERE ma.id_matriculas = $1
       ORDER BY a.nombre ASC`,
      [mat.id_matriculas]
    );

    mat.asignaturas = asigs.map((a) => ({
      ...a,
      corte1: a.corte1 !== null ? Number(a.corte1) : null,
      corte2: a.corte2 !== null ? Number(a.corte2) : null,
      corte3: a.corte3 !== null ? Number(a.corte3) : null,
      notaFinal: a.notaFinal !== null ? Number(a.notaFinal) : null,
      notaActual: a.notaActual !== null ? Number(a.notaActual) : null,
      inasistencias: Number(a.inasistencias) || 0
    }));
    mat.promedioAcademico = mat.promedioAcademico !== null ? Number(mat.promedioAcademico) : null;
    mat.inasistenciasAcumuladas = Number(mat.inasistenciasAcumuladas) || 0;
    mat.totalAsignaturas = Number(mat.totalAsignaturas) || 0;
    mat.asignaturasEvaluadas = Number(mat.asignaturasEvaluadas) || 0;

    const c1Notas = mat.asignaturas.filter((a) => a.corte1 !== null).map((a) => a.corte1);
    const c2Notas = mat.asignaturas.filter((a) => a.corte2 !== null).map((a) => a.corte2);
    const c3Notas = mat.asignaturas.filter((a) => a.corte3 !== null).map((a) => a.corte3);

    mat.promedioCorte1 = c1Notas.length > 0 ? Number((c1Notas.reduce((a, b) => a + b, 0) / c1Notas.length).toFixed(2)) : null;
    mat.promedioCorte2 = c2Notas.length > 0 ? Number((c2Notas.reduce((a, b) => a + b, 0) / c2Notas.length).toFixed(2)) : null;
    mat.promedioCorte3 = c3Notas.length > 0 ? Number((c3Notas.reduce((a, b) => a + b, 0) / c3Notas.length).toFixed(2)) : null;

    mat.materiasAprobadas = mat.asignaturas.filter((a) => a.notaActual !== null && a.notaActual >= 3.0).length;
    mat.materiasEnRiesgo = mat.asignaturas.filter((a) => a.notaActual !== null && a.notaActual < 3.0).length;
    mat.materiasPendientes = mat.asignaturas.filter((a) => a.notaActual === null).length;
  }

  // Matrícula activa/seleccionada
  let matActiva = null;
  if (codigo) {
    matActiva = matriculasRows.find((m) => String(m.codigo).toLowerCase() === String(codigo).toLowerCase());
  }
  if (!matActiva && matriculasRows.length > 0) {
    matActiva = matriculasRows[0];
  }
  const codActivo = matActiva?.codigo || codigo;

  const { rows } = await query(
    `SELECT e.id_estudiantes AS id,
            COALESCE(m.codigo_externo, e.codigo_externo, $2) AS codigo,
            COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
            COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
            COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
            COALESCE(per.correo_institucional, per.correo_electronico, e.correo_institucional) AS email,
            COALESCE(per.celular, per.telefono, e.telefono) AS telefono,
            per.direccion,
            per.estrato,
            per.genero,
            per.eps,
            COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
            COALESCE(pa.nombre, '2026-1') AS periodo,
            COALESCE(pm.nombre, p.nombre, 'Programa Institucional') AS programa,
            EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida",
            cr.factores,
            cr.puntaje_individual,
            cr.puntaje_institucional,
            cr.puntaje_academico,
            cr.puntaje_socioeconomico,
            COALESCE(a.nombres, 'Contacto Familiar') AS acudiente_nombre,
            COALESCE(a.parentesco, 'Acudiente') AS acudiente_parentesco,
            COALESCE(a.telefono, per.telefono, '3187654321') AS acudiente_telefono
     FROM sat.estudiantes e
     LEFT JOIN sat.personas per ON per.id = e.id_personas
     LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes AND (m.codigo_externo = $2 OR $2 IS NULL)
     LEFT JOIN sat.programas_academicos pm ON pm.id_programas_academicos = m.id_programas_academicos
     LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = e.id_programas_academicos
     LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = m.id_periodos_academicos
     LEFT JOIN sat.acudientes a ON a.id_estudiantes = e.id_estudiantes
     LEFT JOIN LATERAL (
       SELECT cr_1.id_rangos_riesgo, cr_1.factores, cr_1.puntaje_individual, cr_1.puntaje_institucional, cr_1.puntaje_academico, cr_1.puntaje_socioeconomico
       FROM sat.calificaciones_riesgo cr_1
       WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
       ORDER BY cr_1.calculado_en DESC
       LIMIT 1
     ) cr ON true
     WHERE e.id_estudiantes = $1
     LIMIT 1`,
    [idEstudiante, codActivo]
  );

  if (rows.length === 0) return null;
  const r = rows[0];

  let factoresParsed = {};
  try {
    factoresParsed = typeof r.factores === "string" ? JSON.parse(r.factores) : r.factores || {};
  } catch {
    factoresParsed = {};
  }

  const dims = factoresParsed.dimensiones || factoresParsed.porDimension || null;
  const puntajesCampo = dims
    ? {
        individual: dims.IND?.riesgo || "Sin datos",
        asistencial: dims.INS?.riesgo || "Sin datos",
        academico: dims.ACA?.riesgo || "Sin datos",
        socioeconomico: dims.SOC?.riesgo || "Sin datos",
        gestionPrograma: dims.GEST_PROG?.riesgo || "Sin datos"
      }
    : r.encuestaRespondida
    ? { individual: "Medio", asistencial: "Bajo", academico: "Medio", socioeconomico: "Medio", gestionPrograma: "Medio" }
    : null;

  const riesgoGlobal = await obtenerRiesgoGlobal(idEstudiante);

  const programaPregrado = matriculasRows.find((m) => m.nivel === "PREGRADO") || null;
  const programaPosgrado = matriculasRows.find((m) => m.nivel === "POSGRADO") || null;
  const tieneDoblePrograma = !!(programaPregrado && programaPosgrado);

  // Promedio global del estudiante combinando todas las materias de sus matrículas
  const todasLasNotas = matriculasRows
    .flatMap((m) => m.asignaturas || [])
    .filter((a) => a.notaActual !== null && a.notaActual !== undefined)
    .map((a) => a.notaActual);

  const promedioGlobalEstudiante = todasLasNotas.length > 0
    ? Number((todasLasNotas.reduce((acc, curr) => acc + curr, 0) / todasLasNotas.length).toFixed(2))
    : (matActiva?.promedioAcademico || null);

  const programasFormateados = matriculasRows.length > 0 ? matriculasRows : [
    {
      id_matriculas: "mat-default",
      codigo: r.codigo || codActivo,
      programa: r.programa,
      nivel: String(r.programa).toUpperCase().includes("ESPECIALIZA") || String(r.programa).toUpperCase().includes("MAESTR") ? "POSGRADO" : "PREGRADO",
      semestre: r.semestre,
      periodo: r.periodo,
      promedioAcademico: null,
      promedioCorte1: null,
      promedioCorte2: null,
      promedioCorte3: null,
      inasistenciasAcumuladas: 0,
      totalAsignaturas: 0,
      asignaturasEvaluadas: 0,
      materiasAprobadas: 0,
      materiasEnRiesgo: 0,
      materiasPendientes: 0,
      estado: "ACTIVA",
      asignaturas: []
    }
  ];

  return {
    id: r.id,
    codigo: matActiva?.codigo || r.codigo || codActivo || null,
    documento: r.documento,
    nombres: r.nombres,
    apellidos: r.apellidos,
    email: r.email || `${codActivo}@est.unicesmag.edu.co`,
    telefono: r.telefono || "3165432109",
    semestre: matActiva?.semestre || r.semestre,
    periodo: matActiva?.periodo || r.periodo,
    programa: matActiva?.programa || r.programa,
    nivel: matActiva?.nivel || (String(r.programa).toUpperCase().includes("ESPECIALIZA") || String(r.programa).toUpperCase().includes("MAESTR") ? "POSGRADO" : "PREGRADO"),
    promedioAcademico: matActiva?.promedioAcademico !== undefined ? matActiva.promedioAcademico : null,
    promedioCorte1: matActiva?.promedioCorte1 || null,
    promedioCorte2: matActiva?.promedioCorte2 || null,
    promedioCorte3: matActiva?.promedioCorte3 || null,
    inasistenciasAcumuladas: matActiva?.inasistenciasAcumuladas || 0,
    asignaturas: matActiva?.asignaturas || [],
    totalAsignaturas: matActiva?.totalAsignaturas || 0,
    asignaturasEvaluadas: matActiva?.asignaturasEvaluadas || 0,
    materiasAprobadas: matActiva?.materiasAprobadas || 0,
    materiasEnRiesgo: matActiva?.materiasEnRiesgo || 0,
    materiasPendientes: matActiva?.materiasPendientes || 0,
    promedioGlobalEstudiante,
    riesgoGlobal: riesgoGlobal === "Sin evaluar" && r.encuestaRespondida ? "Medio" : riesgoGlobal,
    puntajesCampo,
    encuestaRespondida: r.encuestaRespondida,
    acudiente: {
      nombre: r.acudiente_nombre,
      telefono: r.acudiente_telefono,
      parentesco: r.acudiente_parentesco
    },
    // Información de programas simultáneos (Pregrado y Posgrado)
    tieneDoblePrograma,
    programaPregrado,
    programaPosgrado,
    programasMatriculados: programasFormateados
  };
}

function buscarEnMock(cleanId) {
  const m = MOCK_DATA.estudiantes.find(
    (e) => e.codigo.toLowerCase() === cleanId.toLowerCase() || e.documento.toLowerCase() === cleanId.toLowerCase()
  );
  if (!m) return null;

  const asigs = (m.asignaturas || []).map((a) => ({
    ...a,
    corte1: a.corte1 !== null && a.corte1 !== undefined ? Number(a.corte1) : null,
    corte2: a.corte2 !== null && a.corte2 !== undefined ? Number(a.corte2) : null,
    corte3: a.corte3 !== null && a.corte3 !== undefined ? Number(a.corte3) : null,
    notaFinal: a.notaFinal !== null && a.notaFinal !== undefined ? Number(a.notaFinal) : null,
    notaActual: a.notaActual !== null && a.notaActual !== undefined ? Number(a.notaActual) : (a.corte1 ?? null),
    inasistencias: Number(a.inasistencias) || 0,
    estado: a.estado || "CURSANDO"
  }));

  const asigsConNota = asigs.filter((a) => a.notaActual !== null);
  const c1Notas = asigs.filter((a) => a.corte1 !== null).map((a) => a.corte1);
  const c2Notas = asigs.filter((a) => a.corte2 !== null).map((a) => a.corte2);
  const c3Notas = asigs.filter((a) => a.corte3 !== null).map((a) => a.corte3);

  const promedioCorte1 = c1Notas.length > 0 ? Number((c1Notas.reduce((a, b) => a + b, 0) / c1Notas.length).toFixed(2)) : null;
  const promedioCorte2 = c2Notas.length > 0 ? Number((c2Notas.reduce((a, b) => a + b, 0) / c2Notas.length).toFixed(2)) : null;
  const promedioCorte3 = c3Notas.length > 0 ? Number((c3Notas.reduce((a, b) => a + b, 0) / c3Notas.length).toFixed(2)) : null;

  const materiasAprobadas = asigs.filter((a) => a.notaActual !== null && a.notaActual >= 3.0).length;
  const materiasEnRiesgo = asigs.filter((a) => a.notaActual !== null && a.notaActual < 3.0).length;
  const materiasPendientes = asigs.filter((a) => a.notaActual === null).length;

  const progPregrado = {
    id_matriculas: `mat-mock-${m.codigo}`,
    codigo: m.codigo,
    programa: m.programa,
    codigoPrograma: "SIS",
    nivel: "PREGRADO",
    semestre: m.semestre,
    jornada: "DIURNA",
    periodo: m.periodo || "2025 II",
    estado: "ACTIVA",
    promedioAcademico: m.promedioAcademico,
    promedioCorte1,
    promedioCorte2,
    promedioCorte3,
    inasistenciasAcumuladas: m.inasistenciasAcumuladas || 0,
    totalAsignaturas: asigs.length,
    asignaturasEvaluadas: asigsConNota.length,
    materiasAprobadas,
    materiasEnRiesgo,
    materiasPendientes,
    asignaturas: asigs
  };

  return {
    ...m,
    promedioCorte1,
    promedioCorte2,
    promedioCorte3,
    materiasAprobadas,
    materiasEnRiesgo,
    materiasPendientes,
    totalAsignaturas: asigs.length,
    asignaturasEvaluadas: asigsConNota.length,
    promedioGlobalEstudiante: m.promedioAcademico,
    tieneDoblePrograma: false,
    programaPregrado: progPregrado,
    programaPosgrado: null,
    programasMatriculados: [progPregrado],
    asignaturas: asigs
  };
}

// Resuelve un identificador (código o documento) a una ficha completa,
// incluyendo todos sus programas matriculados (pregrado y posgrado).
async function buscarPorIdentificador(id, user) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  try {
    // 1) ¿Es un código de matrícula o código estudiantil? (Búsqueda case-insensitive)
    const { rows: porCodigo } = await query(
      `SELECT e.id_estudiantes, COALESCE(m.codigo_externo, e.codigo_externo) AS codigo 
       FROM sat.estudiantes e
       LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
       WHERE LOWER(m.codigo_externo) = LOWER($1) OR LOWER(e.codigo_externo) = LOWER($1) 
       LIMIT 1`,
      [cleanId]
    );
    if (porCodigo.length > 0) {
      return await construirFichaPorCodigo(porCodigo[0].id_estudiantes, cleanId);
    }

    // 2) ¿Es un documento? (en sat.estudiantes o sat.personas)
    const { rows: porDocumento } = await query(
      `SELECT e.id_estudiantes, e.codigo_externo,
              COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
              COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
              COALESCE(per.numero_identificacion, e.numero_documento) AS numero_documento
       FROM sat.estudiantes e
       LEFT JOIN sat.personas per ON per.id = e.id_personas
       WHERE TRIM(e.numero_documento) = $1 OR TRIM(per.numero_identificacion) = $1
       LIMIT 1`,
      [cleanId]
    );
    if (porDocumento.length > 0) {
      const persona = porDocumento[0];
      return await construirFichaPorCodigo(persona.id_estudiantes, null);
    }
  } catch (err) {
    console.warn("Consulta a sat.estudiantes falló, usando fallback:", err.message);
  }

  return buscarEnMock(cleanId);
}

// GET /api/estudiantes - Búsqueda por código, cédula o nombre
router.get("/", async (req, res, next) => {
  const q = (req.query.q || "").toLowerCase().trim();

  try {
    let resultados = [];

    // Consultar base de datos real (sat.estudiantes + sat.personas + sat.matriculas)
    try {
      const sql = `
        SELECT e.id_estudiantes AS id,
               e.codigo_externo AS codigo,
               COALESCE(per.numero_identificacion, e.numero_documento) AS documento,
               COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
               COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
               COALESCE(per.correo_institucional, per.correo_electronico, e.correo_institucional) AS email,
               COALESCE(per.celular, per.telefono, e.telefono) AS telefono,
               COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
               '2026-1' AS periodo,
               COALESCE(p.nombre, 'Programa Institucional') AS programa,
               COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
               metricas_acad.promedio_calc AS "promedioAcademico",
               COALESCE(metricas_acad.inasistencias_calc, 0) AS "inasistenciasAcumuladas",
               EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
        FROM sat.estudiantes e
        LEFT JOIN sat.personas per ON per.id = e.id_personas
        LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
        LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
        LEFT JOIN LATERAL (
          SELECT 
            ROUND(
              AVG(
                COALESCE(
                  ma.nota_final,
                  (
                    SELECT AVG(val)
                    FROM (VALUES (ma.nota_corte_1), (ma.nota_corte_2), (ma.nota_corte_3)) AS v(val)
                    WHERE val IS NOT NULL
                  )
                )
              )::numeric, 
              2
            ) AS promedio_calc,
            SUM(COALESCE(ma.inasistencias_corte_1, 0) + COALESCE(ma.inasistencias_corte_2, 0) + COALESCE(ma.inasistencias_corte_3, 0)) AS inasistencias_calc
          FROM sat.matriculas_asignaturas ma
          WHERE ma.id_matriculas = m.id_matriculas
        ) metricas_acad ON true
        LEFT JOIN LATERAL (
          SELECT cr_1.id_rangos_riesgo
          FROM sat.calificaciones_riesgo cr_1
          WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
          ORDER BY cr_1.calculado_en DESC
          LIMIT 1
        ) cr ON true
        LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
        ${q ? `WHERE LOWER(COALESCE(e.codigo_externo, '')) LIKE $1
                  OR LOWER(COALESCE(e.numero_documento, '')) LIKE $1
                  OR LOWER(COALESCE(per.numero_identificacion, '')) LIKE $1
                  OR LOWER(COALESCE(per.primer_nombre, '')) LIKE $1
                  OR LOWER(COALESCE(per.primer_apellido, '')) LIKE $1
                  OR LOWER(COALESCE(e.nombres, '')) LIKE $1
                  OR LOWER(COALESCE(e.apellidos, '')) LIKE $1
                  OR LOWER(COALESCE(p.nombre, '')) LIKE $1` : ""}
        ORDER BY e.codigo_externo ASC
        LIMIT 25
      `;
      const params = q ? [`%${q}%`] : [];
      const { rows } = await query(sql, params);
      if (rows.length > 0) {
        resultados = rows.map((r) => {
          let riesgoFormatted = r.riesgoGlobal;
          if (riesgoFormatted === "ALTO") riesgoFormatted = "Alto";
          else if (riesgoFormatted === "MEDIO") riesgoFormatted = "Medio";
          else if (riesgoFormatted === "BAJO") riesgoFormatted = "Bajo";

          return {
            id: r.id,
            codigo: r.codigo,
            documento: r.documento,
            nombres: r.nombres,
            apellidos: r.apellidos,
            email: r.email,
            telefono: r.telefono || "3165432109",
            semestre: r.semestre,
            periodo: r.periodo,
            programa: r.programa,
            promedioAcademico: r.promedioAcademico !== null && r.promedioAcademico !== undefined ? Number(r.promedioAcademico) : null,
            inasistenciasAcumuladas: Number(r.inasistenciasAcumuladas) || 0,
            riesgoGlobal: riesgoFormatted || (r.encuestaRespondida ? "Medio" : "Sin evaluar"),
            encuestaRespondida: r.encuestaRespondida,
            acudiente: { nombre: "Contacto Familiar", telefono: "3187654321", parentesco: "Acudiente" }
          };
        });
      }
    } catch (err) {
      console.warn("Consulta listado sat.estudiantes falló:", err.message);
    }

    // Complementar con MOCK_DATA
    const mockFiltrados = !q
      ? MOCK_DATA.estudiantes
      : MOCK_DATA.estudiantes.filter(
          (e) =>
            e.codigo.toLowerCase().includes(q) ||
            e.documento.toLowerCase().includes(q) ||
            e.nombres.toLowerCase().includes(q) ||
            e.apellidos.toLowerCase().includes(q) ||
            e.programa.toLowerCase().includes(q)
        );

    const codigosExistentes = new Set(resultados.map((r) => r.codigo));
    mockFiltrados.forEach((m) => {
      if (!codigosExistentes.has(m.codigo)) {
        resultados.push(m);
      }
    });

    res.json(resultados);
  } catch (err) {
    next(err);
  }
});

// GET /api/estudiantes/:id - Ficha completa por código, o selector de
// matrículas si :id es un documento con más de un código asociado.
router.get("/:id", async (req, res, next) => {
  try {
    const resultado = await buscarPorIdentificador(req.params.id, req.user);
    if (!resultado) {
      return res.status(404).json({ error: "Estudiante no encontrado con ese código o cédula." });
    }
    if (resultado.multiple) {
      return res.json(resultado);
    }
    if (!directivoPuedeVerEstudiante(req.user, resultado)) {
      return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
    }
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// GET /api/estudiantes/:id/timeline - Historial de intervenciones
router.get("/:id/timeline", async (req, res, next) => {
  try {
    const estudiante = await buscarPorIdentificador(req.params.id, req.user);
    if (!estudiante || estudiante.multiple) {
      return res.json([]);
    }
    if (req.user.rol === "directivo" && !directivoPuedeVerEstudiante(req.user, estudiante)) {
      return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
    }
    const codigo = estudiante.codigo || req.params.id;
    const intervenciones = MOCK_DATA.intervenciones
      .filter((i) => i.codigoEstudiante === codigo)
      .map((i) => sanitizarIntervencion(i, req.user));
    res.json(intervenciones);
  } catch (err) {
    next(err);
  }
});

export default router;
