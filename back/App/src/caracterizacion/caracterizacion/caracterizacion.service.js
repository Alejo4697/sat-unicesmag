import { MOCK_DATA } from "../../shared/menu/mockData.js";
import { query } from "../../../../database/pool.js";
import { INSTRUMENTO_ITEMS, DIM_NOMBRES, evaluarInstrumento } from "../instrumento/instrumento.utils.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(val) {
  return typeof val === "string" && UUID_REGEX.test(val);
}

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

export async function asegurarInstrumentoEnBD() {
  try {
    let encRes = await query(
      `SELECT id_encuestas_caracterizacion AS id FROM sat.encuestas_caracterizacion ORDER BY creado_en DESC LIMIT 1`
    );
    let idEncuesta = encRes.rows[0]?.id;

    if (!idEncuesta) {
      const insEnc = await query(
        `INSERT INTO sat.encuestas_caracterizacion (nombre, version, vigente_desde, activo)
         VALUES ('Formulario caracterización permanencia', 1, '2026-01-01', true)
         RETURNING id_encuestas_caracterizacion AS id`
      );
      idEncuesta = insEnc.rows[0]?.id;
    }

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM sat.preguntas_caracterizacion`);
    if (idEncuesta && (countRes.rows[0]?.total || 0) === 0) {
      for (const item of INSTRUMENTO_ITEMS) {
        const tipoFinal = item.tipo === "sino" ? "BOOLEANO" : item.tipo === "likert_inverso" ? "LIKERT_INVERSO" : "ESCALA_LIKERT";
        const catFinal = mapCategoria(item.dim);
        const pRes = await query(
          `INSERT INTO sat.preguntas_caracterizacion
            (id_encuestas_caracterizacion, texto, tipo_respuesta, categoria, orden, obligatoria, activo)
           VALUES ($1, $2, $3, $4, $5, true, true)
           RETURNING id_preguntas_caracterizacion AS id`,
          [idEncuesta, item.texto, tipoFinal, catFinal, item.id]
        );
        const pregId = pRes.rows[0]?.id;
        if (pregId) {
          if (tipoFinal === "BOOLEANO") {
            await query(
              `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
               VALUES ($1, 'No', 4.00, 1), ($1, 'Sí', 1.00, 2)`,
              [pregId]
            );
          } else if (tipoFinal === "LIKERT_INVERSO") {
            await query(
              `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
               VALUES ($1, 'Muy en desacuerdo', 1.00, 1),
                      ($1, 'En desacuerdo', 2.00, 2),
                      ($1, 'De acuerdo', 3.00, 3),
                      ($1, 'Muy de acuerdo', 4.00, 4)`,
              [pregId]
            );
          } else {
            await query(
              `INSERT INTO sat.opciones_pregunta (id_preguntas_caracterizacion, texto, valor_riesgo, orden)
               VALUES ($1, 'Muy en desacuerdo', 4.00, 1),
                      ($1, 'En desacuerdo', 3.00, 2),
                      ($1, 'De acuerdo', 2.00, 3),
                      ($1, 'Muy de acuerdo', 1.00, 4)`,
              [pregId]
            );
          }
        }
      }
    }
    return idEncuesta;
  } catch {
    return null;
  }
}

export async function obtenerEncuesta() {
  let encuesta = null;
  let preguntas = [];

  try {
    await asegurarInstrumentoEnBD();
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
    // Fallback
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

  return {
    ...encuesta,
    totalPreguntas: preguntas.length > 0 ? preguntas.length : INSTRUMENTO_ITEMS.length,
    totalActivas: preguntas.length > 0 ? totalActivas : INSTRUMENTO_ITEMS.length,
    conteoPorDimension
  };
}

export async function actualizarEncuesta(id, body, user) {
  if (user?.rol !== "admin") {
    const error = new Error("Solo los administradores pueden modificar la encuesta.");
    error.status = 403;
    throw error;
  }

  const { nombre, version, vigente_desde, vigente_hasta, activo } = body;

  if (!nombre) {
    const error = new Error("El nombre de la encuesta es obligatorio.");
    error.status = 400;
    throw error;
  }

  const idEnBd = await asegurarInstrumentoEnBD();
  const targetId = isUuid(id) ? id : idEnBd;

  const { rows } = await query(
    `UPDATE sat.encuestas_caracterizacion
     SET nombre = $1,
         version = COALESCE($2, version),
         vigente_desde = $3,
         vigente_hasta = $4,
         activo = COALESCE($5, activo)
     WHERE id_encuestas_caracterizacion = $6
     RETURNING id_encuestas_caracterizacion AS id, nombre, version, vigente_desde, vigente_hasta, activo`,
    [nombre.trim(), version ? Number(version) : 1, vigente_desde || null, vigente_hasta || null, activo ?? true, targetId]
  );

  if (rows.length === 0) {
    const error = new Error("Encuesta no encontrada.");
    error.status = 404;
    throw error;
  }

  return rows[0];
}

export async function obtenerPreguntas() {
  try {
    await asegurarInstrumentoEnBD();
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
      return rows.map((r) => {
        const dimKey = mapCategoria(r.categoria);
        return {
          ...r,
          dim: dimKey,
          dimNombre: DIM_NOMBRES[dimKey] || DIM_NOMBRES[r.categoria] || r.categoria,
          tipo: mapTipoFrontend(r.tipoRespuesta)
        };
      });
    }
  } catch {
    // Fallback
  }

  return INSTRUMENTO_ITEMS.map((item) => ({
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
}

export async function crearPregunta(body, user) {
  if (user?.rol !== "admin") {
    const error = new Error("Solo los administradores pueden agregar preguntas.");
    error.status = 403;
    throw error;
  }

  const { texto, categoria, tipoRespuesta, orden, obligatoria = true } = body;

  if (!texto || !categoria) {
    const error = new Error("El texto del ítem y la dimensión son obligatorios.");
    error.status = 400;
    throw error;
  }

  const catFinal = mapCategoria(categoria);
  const tipoFinal = mapTipoRespuesta(tipoRespuesta);

  await asegurarInstrumentoEnBD();
  const encRes = await query(
    `SELECT id_encuestas_caracterizacion FROM sat.encuestas_caracterizacion WHERE activo = true LIMIT 1`
  );
  const idEncuesta = encRes.rows[0]?.id_encuestas_caracterizacion;
  if (!idEncuesta) {
    const error = new Error("No existe una encuesta activa para asociar la pregunta.");
    error.status = 400;
    throw error;
  }

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

  return {
    ...nuevaPregunta,
    dim: catFinal,
    dimNombre: DIM_NOMBRES[catFinal] || catFinal,
    tipo: mapTipoFrontend(tipoFinal)
  };
}

export async function modificarPregunta(id, body, user) {
  if (user?.rol !== "admin") {
    const error = new Error("Solo los administradores pueden modificar preguntas.");
    error.status = 403;
    throw error;
  }

  const { texto, categoria, tipoRespuesta, orden, obligatoria, activo } = body;

  if (!texto || !categoria) {
    const error = new Error("El texto del ítem y la dimensión son obligatorios.");
    error.status = 400;
    throw error;
  }

  const catFinal = mapCategoria(categoria);
  const tipoFinal = mapTipoRespuesta(tipoRespuesta);

  await asegurarInstrumentoEnBD();
  const esIdOrden = String(id).startsWith("item_");
  const ordenBuscar = esIdOrden ? Number(String(id).replace("item_", "")) : null;

  const { rows } = await query(
    esIdOrden
      ? `UPDATE sat.preguntas_caracterizacion
         SET texto = $1,
             categoria = $2,
             tipo_respuesta = $3,
             orden = COALESCE($4, orden),
             obligatoria = COALESCE($5, obligatoria),
             activo = COALESCE($6, activo)
         WHERE orden = $7
         RETURNING id_preguntas_caracterizacion AS id, id_encuestas_caracterizacion AS "idEncuesta",
                   orden, categoria, tipo_respuesta AS "tipoRespuesta", texto, obligatoria, activo`
      : `UPDATE sat.preguntas_caracterizacion
         SET texto = $1,
             categoria = $2,
             tipo_respuesta = $3,
             orden = COALESCE($4, orden),
             obligatoria = COALESCE($5, obligatoria),
             activo = COALESCE($6, activo)
         WHERE id_preguntas_caracterizacion = $7
         RETURNING id_preguntas_caracterizacion AS id, id_encuestas_caracterizacion AS "idEncuesta",
                   orden, categoria, tipo_respuesta AS "tipoRespuesta", texto, obligatoria, activo`,
    [texto.trim(), catFinal, tipoFinal, orden ? Number(orden) : null, obligatoria, activo, esIdOrden ? ordenBuscar : id]
  );

  if (rows.length === 0) {
    const error = new Error("Pregunta no encontrada.");
    error.status = 404;
    throw error;
  }

  const actualizada = rows[0];
  return {
    ...actualizada,
    dim: catFinal,
    dimNombre: DIM_NOMBRES[catFinal] || catFinal,
    tipo: mapTipoFrontend(tipoFinal)
  };
}

export async function togglePregunta(id, user) {
  if (user?.rol !== "admin") {
    const error = new Error("Solo los administradores pueden cambiar el estado de preguntas.");
    error.status = 403;
    throw error;
  }

  await asegurarInstrumentoEnBD();
  const esIdOrden = String(id).startsWith("item_");
  const valorFiltro = esIdOrden ? Number(String(id).replace("item_", "")) : id;

  const { rows } = await query(
    esIdOrden
      ? `UPDATE sat.preguntas_caracterizacion
         SET activo = NOT activo
         WHERE orden = $1
         RETURNING id_preguntas_caracterizacion AS id, orden, categoria, texto, activo`
      : `UPDATE sat.preguntas_caracterizacion
         SET activo = NOT activo
         WHERE id_preguntas_caracterizacion = $1
         RETURNING id_preguntas_caracterizacion AS id, orden, categoria, texto, activo`,
    [valorFiltro]
  );

  if (rows.length === 0) {
    const error = new Error("Pregunta no encontrada.");
    error.status = 404;
    throw error;
  }

  return rows[0];
}

export async function eliminarPregunta(id, user) {
  if (user?.rol !== "admin") {
    const error = new Error("Solo los administradores pueden eliminar preguntas.");
    error.status = 403;
    throw error;
  }

  await asegurarInstrumentoEnBD();
  let targetId = id;
  if (String(id).startsWith("item_")) {
    const ordenNum = Number(String(id).replace("item_", ""));
    const r = await query(`SELECT id_preguntas_caracterizacion AS id FROM sat.preguntas_caracterizacion WHERE orden = $1 LIMIT 1`, [ordenNum]);
    targetId = r.rows[0]?.id || id;
  }

  const respCheck = await query(
    `SELECT COUNT(*) FROM sat.respuestas_detalle WHERE id_preguntas_caracterizacion = $1`,
    [targetId]
  );

  if (Number(respCheck.rows[0].count) > 0) {
    await query(
      `UPDATE sat.preguntas_caracterizacion SET activo = false WHERE id_preguntas_caracterizacion = $1`,
      [targetId]
    );
    return {
      ok: true,
      message: "La pregunta tiene respuestas históricas registradas y fue inhabilitada para preservar el historial."
    };
  }

  await query(`DELETE FROM sat.opciones_pregunta WHERE id_preguntas_caracterizacion = $1`, [targetId]);
  const { rowCount } = await query(
    `DELETE FROM sat.preguntas_caracterizacion WHERE id_preguntas_caracterizacion = $1`,
    [targetId]
  );

  if (rowCount === 0) {
    const error = new Error("Pregunta no encontrada.");
    error.status = 404;
    throw error;
  }

  return { ok: true, message: "Pregunta eliminada exitosamente." };
}

export async function obtenerInstrumento() {
  try {
    await asegurarInstrumentoEnBD();
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
      return rows.map((r) => {
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
    }
  } catch {
    // Fallback
  }
  return INSTRUMENTO_ITEMS;
}

export async function obtenerEstudianteInfo(codigo) {
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
       WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR e.id_estudiantes::text = $1
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
    const error = new Error("Estudiante no encontrado.");
    error.status = 404;
    throw error;
  }

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

  return {
    ...estudianteData,
    docenteAcompanante
  };
}

function construirDetallesSesion(respuestas = {}, items = INSTRUMENTO_ITEMS) {
  return items.map((item) => {
    const rawDim = item.dim || item.categoria || "IND";
    const dim = rawDim === "GEST PROG" ? "GEST_PROG" : rawDim;
    const key = item.dbId ? `item_${item.dbId}` : `item_${item.id}`;
    let val = respuestas[key] ?? respuestas[`item_${item.id}`] ?? respuestas[`item_${item.orden}`] ?? 2;
    if (typeof val === "string") val = Number(val) || 2;

    let opcionTexto = "En desacuerdo";
    let nivelRiesgo = "Medio";

    if (item.tipo === "sino" || item.tipo_respuesta === "BOOLEANO") {
      opcionTexto = val === 4 ? "Sí" : "No";
      nivelRiesgo = val === 4 ? "Bajo" : "Alto";
    } else if (item.tipo === "likert_inverso" || item.tipo_respuesta === "LIKERT_INVERSO") {
      const opcionesInversas = {
        1: { texto: "Muy en desacuerdo", riesgo: "Bajo" },
        2: { texto: "En desacuerdo", riesgo: "Bajo" },
        3: { texto: "De acuerdo", riesgo: "Medio" },
        4: { texto: "Muy de acuerdo", riesgo: "Alto" }
      };
      opcionTexto = opcionesInversas[val]?.texto || "En desacuerdo";
      nivelRiesgo = opcionesInversas[val]?.riesgo || "Medio";
    } else {
      const opcionesLikert = {
        1: { texto: "Muy en desacuerdo", riesgo: "Alto" },
        2: { texto: "En desacuerdo", riesgo: "Medio" },
        3: { texto: "De acuerdo", riesgo: "Bajo" },
        4: { texto: "Muy de acuerdo", riesgo: "Bajo" }
      };
      opcionTexto = opcionesLikert[val]?.texto || "En desacuerdo";
      nivelRiesgo = opcionesLikert[val]?.riesgo || "Medio";
    }

    return {
      id: item.id || item.orden,
      dbId: item.dbId,
      orden: item.orden || item.id,
      texto: item.texto,
      dim,
      dimNombre: DIM_NOMBRES[dim] || item.dimNombre || dim,
      valor: val,
      opcionTexto,
      nivelRiesgo,
      tipo: item.tipo || mapTipoFrontend(item.tipo_respuesta)
    };
  });
}

export async function obtenerHistorialEstudiante(codigo) {
  let itemsActivos = INSTRUMENTO_ITEMS;
  try {
    const { rows: pregRows } = await query(
      `SELECT p.id_preguntas_caracterizacion AS "dbId", p.orden AS id, p.orden, p.categoria, p.tipo_respuesta, p.texto
       FROM sat.preguntas_caracterizacion p WHERE p.activo = true ORDER BY p.orden ASC`
    );
    if (pregRows.length > 0) {
      itemsActivos = pregRows.map((r) => ({
        id: r.id,
        dbId: r.dbId,
        orden: r.orden,
        dim: mapCategoria(r.categoria),
        dimNombre: DIM_NOMBRES[mapCategoria(r.categoria)] || r.categoria,
        tipo: mapTipoFrontend(r.tipo_respuesta),
        tipo_respuesta: r.tipo_respuesta,
        texto: r.texto
      }));
    }
  } catch {
    // Fallback
  }

  try {
    const { rows: sesionRows } = await query(
      `SELECT rc.id_respuestas_caracterizacion AS id,
              e.codigo_externo AS "codigoEstudiante",
              COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
              COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
              e.semestre_actual AS semestre,
              pa.nombre AS periodo,
              rc.creado_en AS fecha,
              cr.puntaje_global AS "puntajeGlobal",
              COALESCE(rr.nombre, 'MEDIO') AS "riesgoGlobal",
              cr.factores
       FROM sat.respuestas_caracterizacion rc
       JOIN sat.estudiantes e ON rc.id_estudiantes = e.id_estudiantes
       LEFT JOIN sat.personas per ON per.id = e.id_personas
       LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
       LEFT JOIN sat.periodos_academicos pa ON rc.id_periodos_academicos = pa.id_periodos_academicos
       LEFT JOIN sat.calificaciones_riesgo cr ON cr.id_respuestas_caracterizacion = rc.id_respuestas_caracterizacion
       LEFT JOIN sat.rangos_riesgo rr ON rr.id_rangos_riesgo = cr.id_rangos_riesgo
       WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR per.numero_identificacion = $1 OR m.codigo_externo = $1 OR e.id_estudiantes::text = $1
       ORDER BY rc.creado_en DESC`,
      [codigo]
    );

    if (sesionRows.length > 0) {
      const sesionesConDetalle = await Promise.all(
        sesionRows.map(async (ses) => {
          const { rows: detRows } = await query(
            `SELECT rd.id_preguntas_caracterizacion AS "dbId",
                    p.orden,
                    p.texto,
                    p.categoria,
                    p.tipo_respuesta AS "tipoRespuesta",
                    rd.valor_numerico AS valor,
                    COALESCE(op.texto, '') AS "opcionTexto"
             FROM sat.respuestas_detalle rd
             JOIN sat.preguntas_caracterizacion p ON rd.id_preguntas_caracterizacion = p.id_preguntas_caracterizacion
             LEFT JOIN sat.opciones_pregunta op ON rd.id_opciones_pregunta = op.id_opciones_pregunta
             WHERE rd.id_respuestas_caracterizacion = $1
             ORDER BY p.orden ASC`,
            [ses.id]
          );

          let factoresParsed = {};
          try {
            factoresParsed = typeof ses.factores === "string" ? JSON.parse(ses.factores) : ses.factores || {};
          } catch {
            factoresParsed = {};
          }

          const dimsObj = factoresParsed.dimensiones || factoresParsed.porDimension || null;
          let riesgoGlobalFormatted = ses.riesgoGlobal;
          if (riesgoGlobalFormatted === "ALTO") riesgoGlobalFormatted = "Alto";
          else if (riesgoGlobalFormatted === "MEDIO") riesgoGlobalFormatted = "Medio";
          else if (riesgoGlobalFormatted === "BAJO") riesgoGlobalFormatted = "Bajo";

          const detalles = detRows.length > 0
            ? detRows.map((d) => {
                const dimKey = mapCategoria(d.categoria);
                const valor = Number(d.valor) || 2;
                let opcionTexto = d.opcionTexto;
                let nivelRiesgo = "Medio";

                if (d.tipoRespuesta === "BOOLEANO") {
                  opcionTexto = opcionTexto || (valor === 4 ? "Sí" : "No");
                  nivelRiesgo = valor === 4 ? "Bajo" : "Alto";
                } else if (d.tipoRespuesta === "LIKERT_INVERSO") {
                  if (!opcionTexto) {
                    const m = { 1: "Muy en desacuerdo", 2: "En desacuerdo", 3: "De acuerdo", 4: "Muy de acuerdo" };
                    opcionTexto = m[valor] || "En desacuerdo";
                  }
                  nivelRiesgo = valor >= 3 ? "Alto" : "Bajo";
                } else {
                  if (!opcionTexto) {
                    const m = { 1: "Muy en desacuerdo", 2: "En desacuerdo", 3: "De acuerdo", 4: "Muy de acuerdo" };
                    opcionTexto = m[valor] || "En desacuerdo";
                  }
                  nivelRiesgo = valor <= 2 ? "Alto" : "Bajo";
                }

                return {
                  id: d.orden,
                  dbId: d.dbId,
                  orden: d.orden,
                  texto: d.texto,
                  dim: dimKey,
                  dimNombre: DIM_NOMBRES[dimKey] || d.categoria,
                  valor,
                  opcionTexto,
                  nivelRiesgo,
                  tipo: mapTipoFrontend(d.tipoRespuesta)
                };
              })
            : construirDetallesSesion({}, itemsActivos);

          return {
            id: ses.id,
            codigoEstudiante: ses.codigoEstudiante,
            fecha: ses.fecha ? new Date(ses.fecha).toISOString().replace("T", " ").substring(0, 16) : "2025-08-20 10:30",
            periodo: ses.periodo || "2025 II",
            semestre: ses.semestre || 1,
            riesgoGlobal: riesgoGlobalFormatted || (dimsObj ? "Medio" : "Medio"),
            promedioGlobal: ses.puntajeGlobal ? Number((Number(ses.puntajeGlobal) / 25).toFixed(2)) : 2.5,
            porDimension: dimsObj || {
              IND: { promedio: 2.0, riesgo: "Medio" },
              INS: { promedio: 3.0, riesgo: "Bajo" },
              ACA: { promedio: 2.5, riesgo: "Medio" },
              SOC: { promedio: 2.0, riesgo: "Medio" },
              GEST_PROG: { promedio: 2.8, riesgo: "Medio" }
            },
            detalles
          };
        })
      );

      return sesionesConDetalle;
    }
  } catch (dbErr) {
    console.warn("Consulta a sat.respuestas_caracterizacion falló, usando MOCK_DATA:", dbErr.message);
  }

  const estMock = MOCK_DATA.estudiantes.find((e) => e.codigo === codigo || e.documento === codigo);
  const codigoReal = estMock ? estMock.codigo : codigo;
  const envios = MOCK_DATA.caracterizaciones.filter(
    (c) => c.codigoEstudiante === codigoReal || c.codigoEstudiante === codigo
  );

  return envios.map((env) => ({
    ...env,
    detalles: construirDetallesSesion(env.respuestas || {}, itemsActivos)
  }));
}

export async function enviarEncuesta(body, user) {
  const { codigoEstudiante, respuestas } = body;

  if (!codigoEstudiante || !respuestas || typeof respuestas !== "object") {
    const error = new Error("Datos incompletos para procesar la encuesta.");
    error.status = 400;
    throw error;
  }

  let itemsActivos = INSTRUMENTO_ITEMS;
  let opcionesMap = new Map();
  try {
    const { rows: pregRows } = await query(
      `SELECT p.id_preguntas_caracterizacion AS "dbId", p.orden AS id, p.orden, p.categoria, p.tipo_respuesta, p.texto
       FROM sat.preguntas_caracterizacion p WHERE p.activo = true ORDER BY p.orden ASC`
    );
    if (pregRows.length > 0) {
      itemsActivos = pregRows.map((r) => ({
        id: r.id,
        dbId: r.dbId,
        orden: r.orden,
        dim: mapCategoria(r.categoria),
        dimNombre: DIM_NOMBRES[mapCategoria(r.categoria)] || r.categoria,
        tipo: mapTipoFrontend(r.tipo_respuesta),
        tipo_respuesta: r.tipo_respuesta,
        texto: r.texto
      }));
    }

    const { rows: opcRows } = await query(
      `SELECT id_opciones_pregunta, id_preguntas_caracterizacion, valor_numerico
       FROM sat.opciones_pregunta`
    );
    opcRows.forEach((o) => {
      opcionesMap.set(`${o.id_preguntas_caracterizacion}_${o.valor_numerico}`, o.id_opciones_pregunta);
    });
  } catch {
    // Usar defaults
  }

  const totalItems = itemsActivos.length;
  const respondidos = Object.keys(respuestas).length;
  if (respondidos < totalItems) {
    const error = new Error(`Por favor complete todos los ${totalItems} ítems del instrumento (${respondidos}/${totalItems}).`);
    error.status = 400;
    throw error;
  }

  const resultado = evaluarInstrumento(respuestas, itemsActivos);

  let estudianteDb = null;
  try {
    const estRes = await query(
      `SELECT e.id_estudiantes, e.codigo_externo,
              COALESCE(per.numero_identificacion, e.numero_documento) AS numero_documento,
              COALESCE(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre), e.nombres) AS nombres,
              COALESCE(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido), e.apellidos) AS apellidos,
              e.semestre_actual, e.id_programas_academicos, e.id_sedes 
       FROM sat.estudiantes e
       LEFT JOIN sat.personas per ON per.id = e.id_personas
       LEFT JOIN sat.matriculas m ON m.id_estudiantes = e.id_estudiantes
       WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR per.numero_identificacion = $1 OR m.codigo_externo = $1 OR e.id_estudiantes::text = $1 
       LIMIT 1`,
      [codigoEstudiante]
    );
    if (estRes.rows.length > 0) {
      estudianteDb = estRes.rows[0];
    }
  } catch {
    // Continuar si hay error de DB
  }

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

  let idRespuestaCaracterizacion = null;
  if (estudianteDb && idEncuesta) {
    try {
      const rcRes = await query(
        `INSERT INTO sat.respuestas_caracterizacion 
          (id_estudiantes, id_encuestas_caracterizacion, id_periodos_academicos, id_usuarios, estado, creado_en)
         VALUES ($1, $2, $3, $4, 'COMPLETA', NOW())
         RETURNING id_respuestas_caracterizacion`,
         [estudianteDb.id_estudiantes, idEncuesta, idPeriodo, isUuid(user?.id) ? user.id : null]
      );
      idRespuestaCaracterizacion = rcRes.rows[0]?.id_respuestas_caracterizacion;

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

      let idRangoRiesgo = null;
      const rangoNombre = (resultado.riesgoGlobal || "MEDIO").toUpperCase();
      const rangoRes = await query(
        `SELECT id_rangos_riesgo FROM sat.rangos_riesgo WHERE UPPER(nombre) = $1 ORDER BY actualizado_en DESC LIMIT 1`,
        [rangoNombre]
      );
      idRangoRiesgo = rangoRes.rows[0]?.id_rangos_riesgo;
      if (!idRangoRiesgo) {
        const fallbackRango = await query(`SELECT id_rangos_riesgo FROM sat.rangos_riesgo LIMIT 1`);
        idRangoRiesgo = fallbackRango.rows[0]?.id_rangos_riesgo;
      }

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
          resultado.promedioGlobal * 25,
          resultado.porDimension.ACA?.suma || 0,
          resultado.porDimension.SOC?.suma || 0,
          resultado.porDimension.INS?.suma || 0,
          resultado.porDimension.IND?.suma || 0,
          idRangoRiesgo,
          JSON.stringify({
            semestre: estudianteDb.semestre_actual || 1,
            dimensiones: resultado.porDimension,
            nivelPermanencia: resultado.nivelPermanencia,
            mensajePermanencia: resultado.mensajePermanencia,
            conceptosPorDimension: resultado.conceptosPorDimension
          })
        ]
      );
    } catch (dbSaveErr) {
      console.error("Error al persistir caracterización en DataBasePractica:", dbSaveErr);
    }
  }

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
    respuestas,
    detalles: construirDetallesSesion(respuestas, itemsActivos),
    ...resultado
  };

  MOCK_DATA.caracterizaciones.unshift(envio);
  const estudianteMock = MOCK_DATA.estudiantes.find((e) => e.codigo === codigoEstudiante);
  if (estudianteMock) {
    estudianteMock.encuestaRespondida = true;
    if (resultado.riesgoGlobal) estudianteMock.riesgoGlobal = resultado.riesgoGlobal;
  }

  return envio;
}
