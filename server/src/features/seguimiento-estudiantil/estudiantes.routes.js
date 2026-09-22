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
  const { rows } = await query(
    `SELECT e.id_estudiantes AS id,
            e.numero_documento AS documento,
            e.nombres,
            e.apellidos,
            e.correo_institucional AS email,
            e.telefono,
            COALESCE(m.semestre, e.semestre_actual, 1) AS semestre,
            COALESCE(pa.nombre, '2026-1') AS periodo,
            COALESCE(pm.nombre, p.nombre, 'Ingeniería de Sistemas') AS programa,
            3.8 AS "promedioAcademico",
            4 AS "inasistenciasAcumuladas",
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
     LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes AND m.codigo_externo = $2
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
    [idEstudiante, codigo]
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

  return {
    id: r.id,
    codigo: codigo || null,
    documento: r.documento,
    nombres: r.nombres,
    apellidos: r.apellidos,
    email: r.email || `${codigo}@est.unicesmag.edu.co`,
    telefono: r.telefono || "3165432109",
    semestre: r.semestre,
    periodo: r.periodo,
    programa: r.programa,
    promedioAcademico: Number(r.promedioAcademico) || 3.8,
    inasistenciasAcumuladas: Number(r.inasistenciasAcumuladas) || 4,
    riesgoGlobal: riesgoGlobal === "Sin evaluar" && r.encuestaRespondida ? "Medio" : riesgoGlobal,
    puntajesCampo,
    encuestaRespondida: r.encuestaRespondida,
    acudiente: {
      nombre: r.acudiente_nombre || "Carmen Bastidas",
      telefono: r.acudiente_telefono || "3187654321",
      parentesco: r.acudiente_parentesco || "Madre"
    }
  };
}

function buscarEnMock(cleanId) {
  return MOCK_DATA.estudiantes.find(
    (e) => e.codigo.toLowerCase() === cleanId.toLowerCase() || e.documento.toLowerCase() === cleanId.toLowerCase()
  );
}

// Resuelve un identificador (código o documento) a: null (no encontrado),
// una ficha completa (código, o documento con 0-1 matrícula), o
// { multiple: true, matriculas: [...] } (documento con 2+ matrículas).
async function buscarPorIdentificador(id, user) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  try {
    // 1) ¿Es un código de matrícula? (fuente de verdad nueva)
    const { rows: porMatricula } = await query(
      `SELECT id_estudiantes FROM sat.matriculas WHERE codigo_externo = $1 LIMIT 1`,
      [cleanId]
    );
    if (porMatricula.length > 0) {
      return await construirFichaPorCodigo(porMatricula[0].id_estudiantes, cleanId);
    }

    // 2) ¿Es el código legado de sat.estudiantes (fila sin matrícula backfillada)?
    const { rows: porCodigoLegado } = await query(
      `SELECT id_estudiantes, codigo_externo FROM sat.estudiantes WHERE codigo_externo = $1 LIMIT 1`,
      [cleanId]
    );
    if (porCodigoLegado.length > 0) {
      return await construirFichaPorCodigo(porCodigoLegado[0].id_estudiantes, porCodigoLegado[0].codigo_externo);
    }

    // 3) ¿Es un documento? (numero_documento es UNIQUE - identifica una persona)
    const { rows: porDocumento } = await query(
      `SELECT id_estudiantes, nombres, apellidos, numero_documento FROM sat.estudiantes WHERE numero_documento = $1 LIMIT 1`,
      [cleanId]
    );
    if (porDocumento.length === 0) {
      return buscarEnMock(cleanId);
    }
    const persona = porDocumento[0];

    const { rows: matriculas } = await query(
      `SELECT m.codigo_externo AS codigo,
              COALESCE(p.nombre, 'Sin programa asignado') AS programa,
              COALESCE(pa.nombre, 'Sin periodo') AS periodo,
              m.semestre,
              m.estado
       FROM sat.matriculas m
       LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos = m.id_programas_academicos
       LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = m.id_periodos_academicos
       WHERE m.id_estudiantes = $1 AND m.codigo_externo IS NOT NULL
       ORDER BY m.codigo_externo`,
      [persona.id_estudiantes]
    );

    // Director: mismo alcance que ya aplica a la ficha (propio programa + en
    // riesgo), pero evaluado por matrícula para no listarle códigos ajenos.
    let matriculasVisibles = matriculas;
    if (user?.rol === "directivo") {
      const riesgoGlobal = await obtenerRiesgoGlobal(persona.id_estudiantes);
      matriculasVisibles = matriculas.filter((m) => directivoPuedeVerEstudiante(user, { programa: m.programa, riesgoGlobal }));
    }

    if (matriculasVisibles.length > 1) {
      return {
        multiple: true,
        documento: persona.numero_documento,
        nombres: persona.nombres,
        apellidos: persona.apellidos,
        matriculas: matriculasVisibles
      };
    }

    if (matriculasVisibles.length === 1) {
      return await construirFichaPorCodigo(persona.id_estudiantes, matriculasVisibles[0].codigo);
    }

    // Documento sin ninguna matrícula con código (o ninguna visible para
    // este rol): intenta con el código legado de sat.estudiantes.
    const { rows: legado } = await query(`SELECT codigo_externo FROM sat.estudiantes WHERE id_estudiantes = $1`, [
      persona.id_estudiantes
    ]);
    if (legado[0]?.codigo_externo) {
      return await construirFichaPorCodigo(persona.id_estudiantes, legado[0].codigo_externo);
    }
    return null;
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
