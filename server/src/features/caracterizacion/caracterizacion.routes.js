/* ==========================================================================
   Feature: Caracterización (Instrumento institucional, 34 ítems)
   ==========================================================================
   Endpoints:
     GET    /api/caracterizacion/encuesta       -> metadatos y estadísticas de la encuesta
     PUT    /api/caracterizacion/encuesta/:id   -> actualizar nombre/vigencia (solo admin)
     GET    /api/caracterizacion/preguntas      -> todas las preguntas para administración
     POST   /api/caracterizacion/preguntas      -> agregar nueva pregunta (solo admin)
     PUT    /api/caracterizacion/preguntas/:id  -> editar pregunta existente (solo admin)
     PATCH  /api/caracterizacion/preguntas/:id/toggle -> habilitar/inhabilitar (solo admin)
     DELETE /api/caracterizacion/preguntas/:id  -> eliminar / soft delete (solo admin)

     GET    /api/caracterizacion/instrumento    -> preguntas activas para el formulario
     POST   /api/caracterizacion                -> enviar y evaluar respuestas
     GET    /api/caracterizacion/:codigo        -> historial de envíos de un estudiante
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { query } from "../../shared/db/pool.js";
import { INSTRUMENTO_ITEMS, DIM_NOMBRES, evaluarInstrumento } from "./instrumento.js";

const router = Router();

router.use(identifyUser, requireModule("caracterizacion"));

// Helper para normalizar categorías y tipos
function mapCategoria(cat) {
  if (!cat) return "IND";
  const upper = String(cat).toUpperCase().trim();
  if (upper === "GEST PROG" || upper === "GEST_PROG") return "GEST_PROG";
  return upper;
}

function mapTipoRespuesta(tipo) {
  if (!tipo) return "ESCALA_LIKERT";
  const upper = String(tipo).toUpperCase().trim();
  if (upper === "SINO" || upper === "BOOLEANO") return "BOOLEANO";
  if (upper === "LIKERT_INVERSO") return "LIKERT_INVERSO";
  return "ESCALA_LIKERT";
}

function mapTipoFrontend(tipoRespuesta) {
  if (tipoRespuesta === "BOOLEANO" || tipoRespuesta === "sino") return "sino";
  if (tipoRespuesta === "LIKERT_INVERSO") return "likert_inverso";
  return "likert";
}

// --------------------------------------------------------------------------
// 1. GET /encuesta - Metadatos de la encuesta y resumen por dimensiones
// --------------------------------------------------------------------------
router.get("/encuesta", async (req, res, next) => {
  try {
    let encuesta = null;
    let preguntas = [];

    try {
      const encRes = await query(
        `SELECT id_encuestas_caracterizacion AS id, nombre, version, vigente_desde, vigente_hasta, activo
         FROM sat.encuestas_caracterizacion
         ORDER BY creado_en DESC LIMIT 1`
      );
      if (encRes.rows.length > 0) {
        encuesta = encRes.rows[0];
      }

      const pregRes = await query(
        `SELECT categoria, activo FROM sat.preguntas_caracterizacion`
      );
      preguntas = pregRes.rows;
    } catch {
      // Fallback si no hay BD
    }

    if (!encuesta) {
      encuesta = {
        id: "default-encuesta-001",
        nombre: "Formulario caracterización permanencia",
        version: 1,
        vigente_desde: "2026-09-01",
        vigente_hasta: null,
        activo: true
      };
    }

    const conteoPorDimension = { IND: 0, INS: 0, ACA: 0, SOC: 0, GEST_PROG: 0 };
    let totalActivas = 0;

    if (preguntas.length > 0) {
      preguntas.forEach((p) => {
        const dim = mapCategoria(p.categoria);
        if (conteoPorDimension[dim] !== undefined) {
          conteoPorDimension[dim]++;
        } else {
          conteoPorDimension[dim] = 1;
        }
        if (p.activo) totalActivas++;
      });
    } else {
      INSTRUMENTO_ITEMS.forEach((it) => {
        const dim = mapCategoria(it.dim);
        conteoPorDimension[dim] = (conteoPorDimension[dim] || 0) + 1;
        totalActivas++;
      });
    }

    res.json({
      ...encuesta,
      totalPreguntas: preguntas.length > 0 ? preguntas.length : INSTRUMENTO_ITEMS.length,
      totalActivas: preguntas.length > 0 ? totalActivas : INSTRUMENTO_ITEMS.length,
      conteoPorDimension
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 2. PUT /encuesta/:id - Modificar metadatos de la encuesta (solo admin)
// --------------------------------------------------------------------------
router.put("/encuesta/:id", async (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden modificar la encuesta." });
  }

  const { id } = req.params;
  const { nombre, version, vigente_desde, vigente_hasta, activo } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: "El nombre de la encuesta es obligatorio." });
  }

  try {
    const { rows } = await query(
      `UPDATE sat.encuestas_caracterizacion
       SET nombre = $1,
           version = COALESCE($2, version),
           vigente_desde = $3,
           vigente_hasta = $4,
           activo = COALESCE($5, activo)
       WHERE id_encuestas_caracterizacion = $6
       RETURNING id_encuestas_caracterizacion AS id, nombre, version, vigente_desde, vigente_hasta, activo`,
      [nombre.trim(), version ? Number(version) : 1, vigente_desde || null, vigente_hasta || null, activo ?? true, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Encuesta no encontrada." });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 3. GET /preguntas - Listar todas las preguntas (para administración)
// --------------------------------------------------------------------------
router.get("/preguntas", async (req, res, next) => {
  try {
    try {
      const { rows } = await query(
        `SELECT p.id_preguntas_caracterizacion AS id,
                p.id_encuestas_caracterizacion AS "idEncuesta",
                p.orden,
                p.categoria,
                p.tipo_respuesta AS "tipoRespuesta",
                p.texto,
                p.obligatoria,
                p.activo
         FROM sat.preguntas_caracterizacion p
         ORDER BY p.orden ASC`
      );

      if (rows.length > 0) {
        const formatted = rows.map((r) => {
          const dimKey = mapCategoria(r.categoria);
          return {
            ...r,
            dim: dimKey,
            dimNombre: DIM_NOMBRES[dimKey] || DIM_NOMBRES[r.categoria] || r.categoria,
            tipo: mapTipoFrontend(r.tipoRespuesta)
          };
        });
        return res.json(formatted);
      }
    } catch {
      // Fallback
    }

    // Fallback a mock si no hay BD
    const items = INSTRUMENTO_ITEMS.map((item) => ({
      id: `item_${item.id}`,
      orden: item.id,
      categoria: item.dim,
      dim: item.dim,
      dimNombre: item.dimNombre,
      tipoRespuesta: item.tipo === "sino" ? "BOOLEANO" : item.tipo === "likert_inverso" ? "LIKERT_INVERSO" : "ESCALA_LIKERT",
      tipo: item.tipo,
      texto: item.texto,
      obligatoria: true,
      activo: true
    }));
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 4. POST /preguntas - Crear una nueva pregunta (solo admin)
// --------------------------------------------------------------------------
router.post("/preguntas", async (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden agregar preguntas." });
  }

  const { texto, categoria, tipoRespuesta, orden, obligatoria = true } = req.body;

  if (!texto || !categoria) {
    return res.status(400).json({ error: "El texto del ítem y la dimensión son obligatorios." });
  }

  const catFinal = mapCategoria(categoria);
  const tipoFinal = mapTipoRespuesta(tipoRespuesta);

  try {
    // Obtener ID de la encuesta activa
    const encRes = await query(
      `SELECT id_encuestas_caracterizacion FROM sat.encuestas_caracterizacion WHERE activo = true LIMIT 1`
    );
    const idEncuesta = encRes.rows[0]?.id_encuestas_caracterizacion;
    if (!idEncuesta) {
      return res.status(400).json({ error: "No existe una encuesta activa para asociar la pregunta." });
    }

    // Determinar orden
    let nuevoOrden = orden ? Number(orden) : null;
    if (!nuevoOrden) {
      const maxRes = await query(`SELECT COALESCE(MAX(orden), 0) + 1 AS sig FROM sat.preguntas_caracterizacion`);
      nuevoOrden = Number(maxRes.rows[0].sig);
    }

    const { rows } = await query(
      `INSERT INTO sat.preguntas_caracterizacion
        (id_encuestas_caracterizacion, texto, tipo_respuesta, categoria, orden, obligatoria, activo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id_preguntas_caracterizacion AS id, id_encuestas_caracterizacion AS "idEncuesta",
                 orden, categoria, tipo_respuesta AS "tipoRespuesta", texto, obligatoria, activo`,
      [idEncuesta, texto.trim(), tipoFinal, catFinal, nuevoOrden, obligatoria]
    );

    const nuevaPregunta = rows[0];

    // Insertar opciones estándar según tipo_respuesta
    if (tipoFinal === "BOOLEANO") {
      await query(
        `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
         VALUES ($1, 'No', 4.00, 1), ($1, 'Sí', 1.00, 2)`,
        [nuevaPregunta.id]
      );
    } else if (tipoFinal === "LIKERT_INVERSO") {
      await query(
        `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
         VALUES ($1, 'Muy en desacuerdo', 1.00, 1),
                ($1, 'En desacuerdo', 2.00, 2),
                ($1, 'De acuerdo', 3.00, 3),
                ($1, 'Muy de acuerdo', 4.00, 4)`,
        [nuevaPregunta.id]
      );
    } else {
      await query(
        `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
         VALUES ($1, 'Muy en desacuerdo', 4.00, 1),
                ($1, 'En desacuerdo', 3.00, 2),
                ($1, 'De acuerdo', 2.00, 3),
                ($1, 'Muy de acuerdo', 1.00, 4)`,
        [nuevaPregunta.id]
      );
    }

    res.status(201).json({
      ...nuevaPregunta,
      dim: catFinal,
      dimNombre: DIM_NOMBRES[catFinal] || catFinal,
      tipo: mapTipoFrontend(tipoFinal)
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 5. PUT /preguntas/:id - Modificar una pregunta existente (solo admin)
// --------------------------------------------------------------------------
router.put("/preguntas/:id", async (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden modificar preguntas." });
  }

  const { id } = req.params;
  const { texto, categoria, tipoRespuesta, orden, obligatoria, activo } = req.body;

  if (!texto || !categoria) {
    return res.status(400).json({ error: "El texto del ítem y la dimensión son obligatorios." });
  }

  const catFinal = mapCategoria(categoria);
  const tipoFinal = mapTipoRespuesta(tipoRespuesta);

  try {
    const { rows } = await query(
      `UPDATE sat.preguntas_caracterizacion
       SET texto = $1,
           categoria = $2,
           tipo_respuesta = $3,
           orden = COALESCE($4, orden),
           obligatoria = COALESCE($5, obligatoria),
           activo = COALESCE($6, activo)
       WHERE id_preguntas_caracterizacion = $7
       RETURNING id_preguntas_caracterizacion AS id, id_encuestas_caracterizacion AS "idEncuesta",
                 orden, categoria, tipo_respuesta AS "tipoRespuesta", texto, obligatoria, activo`,
      [texto.trim(), catFinal, tipoFinal, orden ? Number(orden) : null, obligatoria, activo, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Pregunta no encontrada." });
    }

    const actualizada = rows[0];

    res.json({
      ...actualizada,
      dim: catFinal,
      dimNombre: DIM_NOMBRES[catFinal] || catFinal,
      tipo: mapTipoFrontend(tipoFinal)
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 6. PATCH /preguntas/:id/toggle - Activar o inhabilitar pregunta (solo admin)
// --------------------------------------------------------------------------
router.patch("/preguntas/:id/toggle", async (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden cambiar el estado de preguntas." });
  }

  const { id } = req.params;

  try {
    const { rows } = await query(
      `UPDATE sat.preguntas_caracterizacion
       SET activo = NOT activo
       WHERE id_preguntas_caracterizacion = $1
       RETURNING id_preguntas_caracterizacion AS id, orden, categoria, texto, activo`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Pregunta no encontrada." });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 7. DELETE /preguntas/:id - Eliminar o soft-delete de pregunta (solo admin)
// --------------------------------------------------------------------------
router.delete("/preguntas/:id", async (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ error: "Solo los administradores pueden eliminar preguntas." });
  }

  const { id } = req.params;

  try {
    // Verificar si ya tiene respuestas asociadas
    const respCheck = await query(
      `SELECT COUNT(*) FROM sat.respuestas_detalle WHERE id_preguntas_caracterizacion = $1`,
      [id]
    );

    if (Number(respCheck.rows[0].count) > 0) {
      // Inhabilitar para proteger integridad histórica
      await query(
        `UPDATE sat.preguntas_caracterizacion SET activo = false WHERE id_preguntas_caracterizacion = $1`,
        [id]
      );
      return res.json({
        ok: true,
        message: "La pregunta tiene respuestas históricas registradas y fue inhabilitada para preservar el historial."
      });
    }

    // Si no tiene respuestas asociadas, eliminar opciones y pregunta
    await query(`DELETE FROM sat.opciones_pregunta WHERE id_preguntas_caracterizacion = $1`, [id]);
    const { rowCount } = await query(
      `DELETE FROM sat.preguntas_caracterizacion WHERE id_preguntas_caracterizacion = $1`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Pregunta no encontrada." });
    }

    res.json({ ok: true, message: "Pregunta eliminada exitosamente." });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 8. GET /instrumento - Preguntas activas ordenadas para diligenciar
// --------------------------------------------------------------------------
router.get("/instrumento", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id_preguntas_caracterizacion AS "dbId",
              p.orden AS id,
              p.orden,
              p.categoria,
              p.tipo_respuesta AS "tipoRespuesta",
              p.texto,
              p.obligatoria
       FROM sat.preguntas_caracterizacion p
       WHERE p.activo = true
       ORDER BY p.orden ASC`
    );

    if (rows.length > 0) {
      const items = rows.map((r) => {
        const dimKey = mapCategoria(r.categoria);
        return {
          id: r.id,
          dbId: r.dbId,
          orden: r.orden,
          dim: dimKey,
          dimNombre: DIM_NOMBRES[dimKey] || DIM_NOMBRES[r.categoria] || r.categoria,
          texto: r.texto,
          tipo: mapTipoFrontend(r.tipoRespuesta),
          obligatoria: r.obligatoria
        };
      });
      return res.json(items);
    }
  } catch {
    // Si falla consulta a DB, responde el mock estándar
  }

  res.json(INSTRUMENTO_ITEMS);
});

// --------------------------------------------------------------------------
// 9. GET /estudiante-info/:codigo - Consultar datos de solo lectura del estudiante
// --------------------------------------------------------------------------
router.get("/estudiante-info/:codigo", async (req, res, next) => {
  const { codigo } = req.params;
  try {
    let estudianteData = null;

    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes AS id,
                e.codigo_externo AS codigo,
                e.nombres,
                e.apellidos,
                e.tipo_documento AS "tipoDocumento",
                e.numero_documento AS "numeroDocumento",
                e.correo_institucional AS "correoInstitucional",
                e.telefono,
                e.semestre_actual AS semestre,
                e.estado_matricula AS "estadoMatricula",
                p.nombre AS programa,
                s.nombre AS sede
         FROM sat.estudiantes e
         LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
         LEFT JOIN sat.sedes s ON e.id_sedes = s.id_sedes
         WHERE e.codigo_externo = $1 OR e.id_estudiantes::text = $1
         LIMIT 1`,
        [codigo]
      );

      if (rows.length > 0) {
        estudianteData = rows[0];
      }
    } catch (dbErr) {
      console.warn("Consulta a sat.estudiantes falló, usando fallback:", dbErr.message);
    }

    if (!estudianteData) {
      const mockEst = MOCK_DATA.estudiantes.find((e) => e.codigo === codigo || e.documento === codigo);
      if (mockEst) {
        estudianteData = {
          id: `est_${mockEst.codigo}`,
          codigo: mockEst.codigo,
          nombres: mockEst.nombres,
          apellidos: mockEst.apellidos,
          tipoDocumento: "CC",
          numeroDocumento: mockEst.documento,
          correoInstitucional: mockEst.email,
          telefono: mockEst.telefono,
          semestre: mockEst.semestre,
          estadoMatricula: "MATRICULADO",
          programa: mockEst.programa,
          sede: "Sede Principal - Pasto"
        };
      }
    }

    if (!estudianteData) {
      return res.status(404).json({ error: "Estudiante no encontrado." });
    }

    // Buscar docente acompañante
    let docenteAcompanante = "Equipo de Permanencia y Acompañamiento Institucional";
    try {
      const docRes = await query(
        `SELECT CONCAT(d.nombres, ' ', d.apellidos) AS nombre_completo, d.correo_institucional
         FROM sat.docentes d
         LIMIT 1`
      );
      if (docRes.rows.length > 0 && docRes.rows[0].nombre_completo) {
        docenteAcompanante = docRes.rows[0].nombre_completo;
      }
    } catch {
      // Fallback
    }

    res.json({
      ...estudianteData,
      docenteAcompanante
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 10. GET /:codigo - Historial de caracterizaciones de un estudiante
// --------------------------------------------------------------------------
router.get("/:codigo", async (req, res, next) => {
  const { codigo } = req.params;
  try {
    try {
      const { rows } = await query(
        `SELECT rc.id_respuestas_caracterizacion AS id,
                e.codigo_externo AS "codigoEstudiante",
                rc.creado_en AS fecha,
                cr.puntaje_global AS "puntajeGlobal",
                cr.riesgo_global AS "riesgoGlobal",
                cr.factores
         FROM sat.respuestas_caracterizacion rc
         JOIN sat.estudiantes e ON rc.id_estudiantes = e.id_estudiantes
         LEFT JOIN sat.calificaciones_riesgo cr ON cr.id_respuestas_caracterizacion = rc.id_respuestas_caracterizacion
         WHERE e.codigo_externo = $1 OR e.id_estudiantes::text = $1
         ORDER BY rc.creado_en DESC`,
        [codigo]
      );
      if (rows.length > 0) {
        return res.json(rows);
      }
    } catch {
      // Fallback a mock
    }

    const envios = MOCK_DATA.caracterizaciones.filter((c) => c.codigoEstudiante === codigo);
    res.json(envios);
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// 11. POST / - Enviar, evaluar y persistir encuesta en DataBasePractica
// --------------------------------------------------------------------------
router.post("/", async (req, res, next) => {
  const { codigoEstudiante, respuestas } = req.body;

  if (!codigoEstudiante || !respuestas) {
    return res.status(400).json({ error: "Falta el código del estudiante o las respuestas." });
  }

  try {
    // 1. Cargar items activos de la base de datos
    let itemsActivos = INSTRUMENTO_ITEMS;
    let opcionesMap = new Map(); // id_pregunta + valor -> id_opcion

    try {
      const { rows } = await query(
        `SELECT p.id_preguntas_caracterizacion AS "dbId", p.orden AS id, p.orden, p.categoria, p.tipo_respuesta, p.texto
         FROM sat.preguntas_caracterizacion p WHERE p.activo = true ORDER BY p.orden ASC`
      );
      if (rows.length > 0) {
        itemsActivos = rows.map((r) => ({
          id: r.id,
          dbId: r.dbId,
          orden: r.orden,
          dim: mapCategoria(r.categoria),
          dimNombre: DIM_NOMBRES[mapCategoria(r.categoria)] || r.categoria,
          tipo: mapTipoFrontend(r.tipo_respuesta),
          tipo_respuesta: r.tipo_respuesta,
          texto: r.texto
        }));

        const opRes = await query(`SELECT id_opciones_pregunta, id_preguntas_caracterizacion, texto, valor_riesgo, orden FROM sat.opciones_pregunta`);
        opRes.rows.forEach((op) => {
          opcionesMap.set(`${op.id_preguntas_caracterizacion}_${op.orden}`, op.id_opciones_pregunta);
        });
      }
    } catch {
      // Continúa con fallback
    }

    const totalItems = itemsActivos.length;
    const respondidos = Object.keys(respuestas).length;
    if (respondidos < totalItems) {
      return res.status(400).json({
        error: `Por favor complete todos los ${totalItems} ítems del instrumento (${respondidos}/${totalItems}).`
      });
    }

    // 2. Evaluar instrumento con la matriz psicopedagógica
    const resultado = evaluarInstrumento(respuestas, itemsActivos);

    // 3. Obtener o verificar estudiante en sat.estudiantes
    let estudianteDb = null;
    try {
      const estRes = await query(
        `SELECT id_estudiantes, codigo_externo, nombres, apellidos, semestre_actual, id_programas_academicos, id_sedes 
         FROM sat.estudiantes 
         WHERE codigo_externo = $1 OR id_estudiantes::text = $1 
         LIMIT 1`,
        [codigoEstudiante]
      );
      if (estRes.rows.length > 0) {
        estudianteDb = estRes.rows[0];
      }
    } catch {
      // Continuar si hay error de DB
    }

    // 4. Obtener encuesta activa y período académico activo
    let idEncuesta = null;
    let idPeriodo = null;
    try {
      const encRes = await query(`SELECT id_encuestas_caracterizacion FROM sat.encuestas_caracterizacion WHERE activo = true LIMIT 1`);
      idEncuesta = encRes.rows[0]?.id_encuestas_caracterizacion;

      const perRes = await query(`SELECT id_periodos_academicos FROM sat.periodos_academicos WHERE activo = true LIMIT 1`);
      idPeriodo = perRes.rows[0]?.id_periodos_academicos;
    } catch {
      // Continuar
    }

    // 5. Inserción en sat.respuestas_caracterizacion y sat.respuestas_detalle
    let idRespuestaCaracterizacion = null;
    if (estudianteDb && idEncuesta) {
      try {
        const rcRes = await query(
          `INSERT INTO sat.respuestas_caracterizacion 
            (id_estudiantes, id_encuestas_caracterizacion, id_periodos_academicos, id_usuarios, estado, creado_en)
           VALUES ($1, $2, $3, $4, 'COMPLETA', NOW())
           RETURNING id_respuestas_caracterizacion`,
          [estudianteDb.id_estudiantes, idEncuesta, idPeriodo, req.user?.id || null]
        );
        idRespuestaCaracterizacion = rcRes.rows[0]?.id_respuestas_caracterizacion;

        // Insertar detalles de cada respuesta
        for (const item of itemsActivos) {
          if (item.dbId) {
            const key = `item_${item.id}`;
            const valNumerico = Number(respuestas[key]) || 2;
            const idOpcion = opcionesMap.get(`${item.dbId}_${valNumerico}`) || null;

            await query(
              `INSERT INTO sat.respuestas_detalle 
                (id_respuestas_caracterizacion, id_preguntas_caracterizacion, id_opciones_pregunta, valor_numerico)
               VALUES ($1, $2, $3, $4)`,
              [idRespuestaCaracterizacion, item.dbId, idOpcion, valNumerico]
            );
          }
        }

        // Obtener rango de riesgo correspondiente
        let idRangoRiesgo = null;
        const rangoNombre = resultado.riesgoGlobal; // "Alto", "Medio", "Bajo"
        const rangoRes = await query(`SELECT id_rangos_riesgo FROM sat.rangos_riesgo WHERE LOWER(nombre) = LOWER($1) LIMIT 1`, [rangoNombre]);
        idRangoRiesgo = rangoRes.rows[0]?.id_rangos_riesgo || null;

        // Insertar calificación de riesgo
        await query(
          `INSERT INTO sat.calificaciones_riesgo
            (id_estudiantes, id_respuestas_caracterizacion, id_periodos_academicos, tipo_origen,
             puntaje_global, puntaje_academico, puntaje_socioeconomico, puntaje_institucional, puntaje_individual,
             id_rangos_riesgo, factores, vigente, calculado_en)
           VALUES ($1, $2, $3, 'ENCUESTA', $4, $5, $6, $7, $8, $9, $10, true, NOW())`,
          [
            estudianteDb.id_estudiantes,
            idRespuestaCaracterizacion,
            idPeriodo,
            resultado.promedioGlobal * 25, // Escala 0-100 o escala promedio
            resultado.porDimension.ACA?.suma || 0,
            resultado.porDimension.SOC?.suma || 0,
            resultado.porDimension.INS?.suma || 0,
            resultado.porDimension.IND?.suma || 0,
            idRangoRiesgo,
            JSON.stringify({
              semestre: estudianteDb.semestre_actual || 1,
              dimensiones: resultado.porDimension
            })
          ]
        );
      } catch (dbSaveErr) {
        console.error("Error al persistir caracterización en DataBasePractica:", dbSaveErr);
      }
    }

    // Buscar docente acompañante asignado
    let docenteAcompanante = "Equipo de Permanencia y Acompañamiento Institucional";
    try {
      const docRes = await query(
        `SELECT CONCAT(d.nombres, ' ', d.apellidos) AS nombre_completo
         FROM sat.docentes d
         LIMIT 1`
      );
      if (docRes.rows.length > 0 && docRes.rows[0].nombre_completo) {
        docenteAcompanante = docRes.rows[0].nombre_completo;
      }
    } catch {
      // Fallback
    }

    const envio = {
      id: idRespuestaCaracterizacion || `CAR-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      codigoEstudiante,
      estudiante: estudianteDb ? {
        nombres: estudianteDb.nombres,
        apellidos: estudianteDb.apellidos,
        semestre: estudianteDb.semestre_actual
      } : null,
      docenteAcompanante,
      fecha: new Date().toISOString().replace("T", " ").substring(0, 16),
      ...resultado
    };

    // Actualizar MOCK_DATA en memoria
    MOCK_DATA.caracterizaciones.unshift(envio);
    const estudianteMock = MOCK_DATA.estudiantes.find((e) => e.codigo === codigoEstudiante);
    if (estudianteMock) estudianteMock.encuestaRespondida = true;

    res.status(201).json(envio);
  } catch (err) {
    next(err);
  }
});

export default router;
