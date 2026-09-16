/* ==========================================================================
   Feature: Seguimiento Estudiantil (Ficha 360° - RQF12)
   Búsqueda multicriterio por:
     - Código institucional (ej. 202510045, 220109009, 220109010)
     - Cédula / Documento de identidad (ej. 1085324901, 1085001009, 1085002000)
     - Nombres y Apellidos
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { directivoPuedeVerEstudiante } from "../../shared/security/alcanceDirectivo.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("ficha"));

// Resuelve un estudiante por su código institucional O su cédula (documento)
async function buscarPorIdentificador(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  // 1. Intentar consultar en PostgreSQL sat.estudiantes
  try {
    const { rows } = await query(
      `SELECT e.id_estudiantes AS id,
              e.codigo_externo AS codigo,
              e.numero_documento AS documento,
              e.nombres,
              e.apellidos,
              e.correo_institucional AS email,
              e.telefono,
              COALESCE(e.semestre_actual, 1) AS semestre,
              '2025 II' AS periodo,
              COALESCE(p.nombre, 'Ingeniería de Sistemas') AS programa,
              3.8 AS "promedioAcademico",
              4 AS "inasistenciasAcumuladas",
              COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
              EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida",
              cr.factores,
              cr.puntaje_individual,
              cr.puntaje_institucional,
              cr.puntaje_academico,
              cr.puntaje_socioeconomico,
              a.nombres AS acudiente_nombre,
              a.parentesco AS acudiente_parentesco,
              a.telefono AS acudiente_telefono
       FROM sat.estudiantes e
       LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
       LEFT JOIN sat.acudientes a ON a.id_estudiantes = e.id_estudiantes
       LEFT JOIN LATERAL (
         SELECT cr_1.id_rangos_riesgo, cr_1.factores, cr_1.puntaje_individual, cr_1.puntaje_institucional, cr_1.puntaje_academico, cr_1.puntaje_socioeconomico
         FROM sat.calificaciones_riesgo cr_1
         WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
         ORDER BY cr_1.calculado_en DESC
         LIMIT 1
       ) cr ON true
       LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
       WHERE e.codigo_externo = $1 
          OR e.numero_documento = $1
       LIMIT 1`,
      [cleanId]
    );

    if (rows.length > 0) {
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

      let riesgoGlobalFormatted = r.riesgoGlobal;
      if (riesgoGlobalFormatted === "ALTO") riesgoGlobalFormatted = "Alto";
      else if (riesgoGlobalFormatted === "MEDIO") riesgoGlobalFormatted = "Medio";
      else if (riesgoGlobalFormatted === "BAJO") riesgoGlobalFormatted = "Bajo";

      return {
        id: r.id,
        codigo: r.codigo,
        documento: r.documento,
        nombres: r.nombres,
        apellidos: r.apellidos,
        email: r.email || `${r.codigo}@est.unicesmag.edu.co`,
        telefono: r.telefono || "3165432109",
        semestre: r.semestre,
        periodo: r.periodo,
        programa: r.programa,
        promedioAcademico: Number(r.promedioAcademico) || 3.8,
        inasistenciasAcumuladas: Number(r.inasistenciasAcumuladas) || 4,
        riesgoGlobal: riesgoGlobalFormatted || (r.encuestaRespondida ? "Medio" : "Sin evaluar"),
        puntajesCampo,
        encuestaRespondida: r.encuestaRespondida,
        acudiente: {
          nombre: r.acudiente_nombre || "Carmen Bastidas",
          telefono: r.acudiente_telefono || "3187654321",
          parentesco: r.acudiente_parentesco || "Madre"
        }
      };
    }
  } catch (err) {
    console.warn("Consulta a sat.estudiantes falló, usando fallback:", err.message);
  }

  // 2. Fallback a MOCK_DATA
  return MOCK_DATA.estudiantes.find(
    (e) => e.codigo.toLowerCase() === cleanId.toLowerCase() || e.documento.toLowerCase() === cleanId.toLowerCase()
  );
}

// GET /api/estudiantes - Búsqueda por código, cédula o nombre
router.get("/", async (req, res, next) => {
  const q = (req.query.q || "").toLowerCase().trim();

  try {
    let resultados = [];

    // Intentar consultar base de datos
    try {
      if (q) {
        const { rows } = await query(
          `SELECT e.id_estudiantes AS id,
                  e.codigo_externo AS codigo,
                  e.numero_documento AS documento,
                  e.nombres,
                  e.apellidos,
                  e.correo_institucional AS email,
                  e.telefono,
                  COALESCE(e.semestre_actual, 1) AS semestre,
                  '2025 II' AS periodo,
                  COALESCE(p.nombre, 'Ingeniería de Sistemas') AS programa,
                  COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
                  EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
           FROM sat.estudiantes e
           LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
           LEFT JOIN LATERAL (
             SELECT cr_1.id_rangos_riesgo
             FROM sat.calificaciones_riesgo cr_1
             WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
             ORDER BY cr_1.calculado_en DESC
             LIMIT 1
           ) cr ON true
           LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
           WHERE LOWER(e.codigo_externo) LIKE $1
              OR LOWER(e.numero_documento) LIKE $1
              OR LOWER(e.nombres) LIKE $1
              OR LOWER(e.apellidos) LIKE $1
              OR LOWER(COALESCE(p.nombre, '')) LIKE $1
           LIMIT 20`,
          [`%${q}%`]
        );
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
              promedioAcademico: 3.8,
              inasistenciasAcumuladas: 4,
              riesgoGlobal: riesgoFormatted || (r.encuestaRespondida ? "Medio" : "Sin evaluar"),
              encuestaRespondida: r.encuestaRespondida,
              acudiente: { nombre: "Contacto Familiar", telefono: "3187654321", parentesco: "Acudiente" }
            };
          });
        }
      } else {
        const { rows } = await query(
          `SELECT e.id_estudiantes AS id,
                  e.codigo_externo AS codigo,
                  e.numero_documento AS documento,
                  e.nombres,
                  e.apellidos,
                  e.correo_institucional AS email,
                  e.telefono,
                  COALESCE(e.semestre_actual, 1) AS semestre,
                  '2025 II' AS periodo,
                  COALESCE(p.nombre, 'Ingeniería de Sistemas') AS programa,
                  COALESCE(rr.nombre, 'Sin evaluar') AS "riesgoGlobal",
                  EXISTS(SELECT 1 FROM sat.respuestas_caracterizacion rc WHERE rc.id_estudiantes = e.id_estudiantes) AS "encuestaRespondida"
           FROM sat.estudiantes e
           LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
           LEFT JOIN LATERAL (
             SELECT cr_1.id_rangos_riesgo
             FROM sat.calificaciones_riesgo cr_1
             WHERE cr_1.id_estudiantes = e.id_estudiantes AND cr_1.vigente = true
             ORDER BY cr_1.calculado_en DESC
             LIMIT 1
           ) cr ON true
           LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
           LIMIT 20`
        );
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
              promedioAcademico: 3.8,
              inasistenciasAcumuladas: 4,
              riesgoGlobal: riesgoFormatted || (r.encuestaRespondida ? "Medio" : "Sin evaluar"),
              encuestaRespondida: r.encuestaRespondida,
              acudiente: { nombre: "Contacto Familiar", telefono: "3187654321", parentesco: "Acudiente" }
            };
          });
        }
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

// GET /api/estudiantes/:id - Ficha completa por código o cédula
router.get("/:id", async (req, res, next) => {
  try {
    const estudiante = await buscarPorIdentificador(req.params.id);
    if (!estudiante) {
      return res.status(404).json({ error: "Estudiante no encontrado con ese código o cédula." });
    }
    if (!directivoPuedeVerEstudiante(req.user, estudiante)) {
      return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
    }
    res.json(estudiante);
  } catch (err) {
    next(err);
  }
});

// GET /api/estudiantes/:id/timeline - Historial de intervenciones
router.get("/:id/timeline", async (req, res, next) => {
  try {
    const estudiante = await buscarPorIdentificador(req.params.id);
    if (req.user.rol === "directivo" && (!estudiante || !directivoPuedeVerEstudiante(req.user, estudiante))) {
      return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
    }
    const codigo = estudiante ? estudiante.codigo : req.params.id;
    const intervenciones = MOCK_DATA.intervenciones
      .filter((i) => i.codigoEstudiante === codigo)
      .map((i) => sanitizarIntervencion(i, req.user));
    res.json(intervenciones);
  } catch (err) {
    next(err);
  }
});

export default router;
