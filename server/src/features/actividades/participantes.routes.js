import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { pool, query } from "../../shared/db/pool.js";
import { identifyUser, requireModule, requireRole } from "../../shared/middleware/requireRole.js";
import { generarExcelAsistentes } from "./excelAsistentes.js";

const router = Router();
const TIPOS = new Set(["ESTUDIANTE", "COLABORADOR", "EGRESADO", "EXTERNO"]);
const MAX_IDENTIFICACION_LENGTH = 64;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ASSISTANTS_QUERY = `
  SELECT avp.id_actividades_vec_participantes AS "id",
         pa.nombre AS "periodo",
         p.numero_identificacion AS "identificacion",
         COALESCE(pv.tipo_documento, e.tipo_documento) AS "tipoDocumento",
         COALESCE(m.codigo_externo, e.codigo_externo, pv.codigo) AS "codigo",
         BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido,
                          p.primer_nombre, p.segundo_nombre)) AS "apellidosNombres",
         pv.tipo_participante AS "rolParticipacion",
         COALESCE(roles.roles, ARRAY[pv.tipo_participante]) AS roles,
         avp.asistencia_verificada AS "asistenciaVerificada",
         COALESCE(prog.nombre, pv.programa_academico) AS "programaPregrado",
         pv.programa_posgrado_dependencia AS "programaPosgrado",
         COALESCE(m.semestre, e.semestre_actual, pv.semestre)::text AS "semestre",
         COALESCE(e.genero, p.genero) AS "genero",
         COALESCE(m.jornada, pv.jornada) AS "jornada",
         COALESCE(e.correo_institucional, e.correo_personal,
                  p.correo_institucional, p.correo_electronico) AS "correo",
         COALESCE(p.celular, p.telefono, e.telefono, e.telefono_fijo) AS "contacto",
         pv.tipo_participante AS "tipoParticipante",
         CASE WHEN COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) IS NULL THEN NULL
              ELSE DATE_PART('year', AGE(CURRENT_DATE, COALESCE(e.fecha_nacimiento, p.fecha_nacimiento)))::int
         END AS "edad",
         COALESCE(e.etnia, pv.etnia) AS "etnia",
         pv.municipio AS "municipio",
         COALESCE(p.victima_conflicto, pv.conflicto_armado) AS "conflictoArmado",
         pv.discapacidad AS "discapacidad",
         COALESCE(cat.actividad, a.actividad) AS "actividad",
         COALESCE(cat.descripcion, a.descripcion_actividad) AS "descripcionActividad",
         COALESCE(cat.proyecto, a.proyecto) AS "proyecto",
         COALESCE(cat.tipo_actividad, a.tipo_actividad) AS "tipoActividad",
         a.tipo_actividad_otra AS "tipoActividadOtra",
         a.alianza_interinstitucional AS "alianzaInterinstitucional",
         a.entidad_alianza AS "entidadAlianza",
         a.articulacion_institucional AS "articulacionInstitucional",
         d.nombre AS "dependencia",
         a.dependencia_otra AS "dependenciaOtra",
         a.modalidad AS "modalidad",
         a.fecha_inicio AS "fechaInicio",
         a.fecha_finalizacion AS "fechaFinalizacion",
         COALESCE(cat.programa, pb.nombre) AS "programaBienestar",
         COALESCE(cat.componente, cb.nombre) AS "componente",
         COALESCE(cat.linea_accion, la.nombre) AS "lineaAccion",
         a.estrategia_politica_bienestar AS "estrategiaBienestar",
         a.estrategia_politica_permanencia AS "estrategiaPermanencia",
         a.estrategia_politica_educacion_inclusiva AS "estrategiaInclusiva",
         ta.nombre AS "tipoApoyo"
  FROM sat.actividades_vec a
  JOIN sat.actividades_vec_participantes avp
    ON avp.id_actividades_vec = a.id_actividades_vec
  JOIN sat.participantes_vec pv
    ON pv.id_participantes_vec = avp.id_participantes_vec
  JOIN sat.personas p ON p.id = pv.id_personas
  JOIN sat.periodos_academicos pa
    ON pa.id_periodos_academicos = a.id_periodos_academicos
  LEFT JOIN sat.catalogo_actividades_vec cat
    ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
   AND cat.tipo_registro = 'ACTIVIDAD'
  LEFT JOIN LATERAL (
    SELECT e.*
    FROM sat.estudiantes e
    WHERE e.id_personas = p.id OR e.numero_documento = p.numero_identificacion
    ORDER BY (e.id_personas = p.id) DESC
    LIMIT 1
  ) e ON TRUE
  LEFT JOIN LATERAL (
    SELECT m.*
    FROM sat.matriculas m
    WHERE m.id_estudiantes = e.id_estudiantes
    ORDER BY (UPPER(COALESCE(m.estado, '')) = 'ACTIVA') DESC, m.id_matriculas DESC
    LIMIT 1
  ) m ON TRUE
  LEFT JOIN sat.programas_academicos prog
    ON prog.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
  LEFT JOIN sat.dependencias d ON d.id_dependencias = a.id_dependencias
  LEFT JOIN sat.programas_bienestar pb
    ON pb.id_programas_bienestar = a.id_programas_bienestar
  LEFT JOIN sat.componentes_bienestar cb
    ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
  LEFT JOIN sat.lineas_accion la ON la.id_lineas_accion = cb.id_lineas_accion
  LEFT JOIN sat.tipos_apoyo ta ON ta.id_tipos_apoyo = avp.id_tipos_apoyo
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(DISTINCT other_pv.tipo_participante ORDER BY other_pv.tipo_participante) AS roles
    FROM sat.participantes_vec other_pv
    WHERE other_pv.id_personas = p.id
  ) roles ON TRUE
  WHERE a.id_catalogo_actividades_vec = $1
    AND ($2::uuid IS NULL OR a.id_periodos_academicos = $2)
    AND (
      $3::text IS NULL
      OR POSITION(LOWER($3) IN LOWER(COALESCE(p.numero_identificacion, ''))) > 0
      OR POSITION(LOWER($3) IN LOWER(COALESCE(m.codigo_externo, e.codigo_externo, pv.codigo, ''))) > 0
      OR POSITION(LOWER($3) IN LOWER(BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido,
                                                      p.primer_nombre, p.segundo_nombre)))) > 0
      OR POSITION(LOWER($3) IN LOWER(COALESCE(e.correo_institucional, e.correo_personal,
                                               p.correo_institucional, p.correo_electronico, ''))) > 0
    )
    AND ($4::date IS NULL OR a.fecha_inicio = $4)
    AND ($5::date IS NULL OR a.fecha_finalizacion = $5)
  ORDER BY a.fecha_inicio DESC NULLS LAST, "apellidosNombres", p.numero_identificacion`;

router.use(identifyUser, requireModule("actividades"));

router.get("/actividades-disponibles", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT cat.id_catalogo_actividades_vec AS id,
              cat.actividad,
              cat.descripcion,
              cat.tipo_actividad AS "tipoActividad",
              cat.proyecto,
              cat.programa,
              cat.componente,
              cat.linea_accion AS "lineaAccion",
              cat.hoja_origen AS "hojaOrigen",
              COUNT(DISTINCT avp.id_actividades_vec_participantes)::int AS "totalAsistentes",
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'id', pa.id_periodos_academicos,
                  'nombre', pa.nombre
                )) FILTER (WHERE pa.id_periodos_academicos IS NOT NULL),
                '[]'::jsonb
              ) AS periodos,
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'id', ta.id_tipos_apoyo,
                  'nombre', ta.nombre
                )) FILTER (WHERE ta.id_tipos_apoyo IS NOT NULL),
                '[]'::jsonb
              ) AS "tiposApoyo"
       FROM sat.catalogo_actividades_vec cat
       LEFT JOIN sat.actividades_vec a
         ON a.id_catalogo_actividades_vec = cat.id_catalogo_actividades_vec
       LEFT JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.tipos_apoyo ta
         ON ta.id_tipos_apoyo = avp.id_tipos_apoyo
       WHERE cat.tipo_registro = 'ACTIVIDAD'
       GROUP BY cat.id_catalogo_actividades_vec
       ORDER BY cat.actividad, cat.hoja_origen, cat.proyecto`,
      []
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/apoyos/catalogo", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT
              COALESCE(NULLIF(BTRIM(nombre_descuento), ''),
                       NULLIF(BTRIM(concepto_descuento), ''),
                       'Apoyo sin clasificar') AS nombre,
              COALESCE(NULLIF(BTRIM(concepto_descuento), ''), '') AS concepto
       FROM sat.apoyos_financieros
       WHERE NULLIF(BTRIM(nombre_descuento), '') IS NOT NULL
          OR NULLIF(BTRIM(concepto_descuento), '') IS NOT NULL
       ORDER BY nombre, concepto`
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/apoyos/listado", async (req, res, next) => {
  const nombreApoyo = String(req.query.nombreApoyo || "").trim();
  const conceptoApoyo = String(req.query.conceptoApoyo || "").trim();
  const idPeriodo = String(req.query.idPeriodo || "").trim() || null;
  const busqueda = String(req.query.busqueda || "").trim() || null;
  const pagina = Number(req.query.pagina || 0);
  if (!nombreApoyo || nombreApoyo.length > 120 || conceptoApoyo.length > 120) {
    return res.status(400).json({ error: "Selecciona un tipo de apoyo válido." });
  }
  if (idPeriodo && !UUID_PATTERN.test(idPeriodo)) {
    return res.status(400).json({ error: "Selecciona un periodo válido." });
  }
  if (busqueda && busqueda.length > 100) {
    return res.status(400).json({ error: "La búsqueda no puede superar 100 caracteres." });
  }
  if (!Number.isInteger(pagina) || pagina < 0 || pagina > 10000) {
    return res.status(400).json({ error: "El número de página no es válido." });
  }

  try {
    const { rows } = await query(
      `WITH registros_apoyo AS (
         SELECT e.id_estudiantes AS "idEstudiante",
                COALESCE(per.numero_identificacion, e.numero_documento) AS identificacion,
                BTRIM(COALESCE(
                  NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''),
                  e.nombres
                )) AS nombres,
                BTRIM(COALESCE(
                  NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''),
                  e.apellidos
                )) AS apellidos,
                e.codigo_externo AS codigo,
                COALESCE(NULLIF(BTRIM(af.nombre_descuento), ''),
                         NULLIF(BTRIM(af.concepto_descuento), ''),
                         'Apoyo sin clasificar') AS "nombreApoyo",
                COALESCE(NULLIF(BTRIM(af.concepto_descuento), ''), '') AS concepto,
                pa.nombre AS periodo,
                af.porcentaje_descuento AS porcentaje,
                af.valor_descuento AS valor
         FROM sat.apoyos_financieros af
         JOIN sat.estudiantes e ON e.id_estudiantes = af.id_estudiantes
         LEFT JOIN sat.personas per ON per.id = e.id_personas
         LEFT JOIN sat.periodos_academicos pa
           ON pa.id_periodos_academicos = af.id_periodos_academicos
         WHERE COALESCE(NULLIF(BTRIM(af.nombre_descuento), ''),
                        NULLIF(BTRIM(af.concepto_descuento), ''),
                        'Apoyo sin clasificar') = $1
           AND COALESCE(NULLIF(BTRIM(af.concepto_descuento), ''), '') = $2
           AND ($3::uuid IS NULL OR af.id_periodos_academicos = $3)
           AND (
             $4::text IS NULL
             OR POSITION(LOWER($4) IN LOWER(COALESCE(per.numero_identificacion, e.numero_documento, ''))) > 0
             OR POSITION(LOWER($4) IN LOWER(BTRIM(CONCAT_WS(' ',
                  COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''), e.apellidos),
                  COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''), e.nombres))))) > 0
             OR POSITION(LOWER($4) IN LOWER(COALESCE(e.codigo_externo, ''))) > 0
           )
       ),
       estudiantes_apoyo AS (
         SELECT "idEstudiante",
                identificacion,
                BTRIM(CONCAT_WS(' ', apellidos, nombres)) AS estudiante,
                codigo,
                STRING_AGG(DISTINCT periodo, ' · ' ORDER BY periodo)
                  FILTER (WHERE periodo IS NOT NULL) AS periodos,
                STRING_AGG(DISTINCT NULLIF(porcentaje::text, ''), ' · ' ORDER BY NULLIF(porcentaje::text, ''))
                  FILTER (WHERE porcentaje IS NOT NULL) AS porcentajes,
                STRING_AGG(DISTINCT NULLIF(valor::text, ''), ' · ' ORDER BY NULLIF(valor::text, ''))
                  FILTER (WHERE valor IS NOT NULL) AS valores
         FROM registros_apoyo
         GROUP BY "idEstudiante", identificacion, apellidos, nombres, codigo
       )
       SELECT *, COUNT(*) OVER()::int AS total
       FROM estudiantes_apoyo
       ORDER BY estudiante, identificacion
       LIMIT 100 OFFSET $5`,
      [nombreApoyo, conceptoApoyo, idPeriodo, busqueda, pagina * 100]
    );
    res.json({
      rows: rows.map(({ total, ...row }) => row),
      total: rows[0]?.total || 0,
      pagina,
      limite: 100,
    });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/asistentes", async (req, res, next) => {
  const filters = normalizarFiltrosAsistentes(req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const sesion = normalizarFechasSesion(req.query);
  if (sesion.error) return res.status(400).json({ error: sesion.error });

  try {
    const { rows } = await query(ASSISTANTS_QUERY, [
      filters.idActividad,
      filters.idPeriodo,
      filters.busqueda,
      sesion.fechaInicio,
      sesion.fechaFinalizacion,
    ]);
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/sesiones", async (req, res, next) => {
  const filters = normalizarFiltrosAsistentes(req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });

  try {
    const { rows } = await query(
      `SELECT a.id_periodos_academicos AS "idPeriodo",
              pa.nombre AS periodo,
              a.fecha_inicio AS "fechaInicio",
              a.fecha_finalizacion AS "fechaFinalizacion",
              COUNT(DISTINCT avp.id_actividades_vec_participantes)::int AS "totalInscritos",
              COUNT(DISTINCT avp.id_actividades_vec_participantes)
                FILTER (WHERE avp.asistencia_verificada)::int AS "totalVerificados"
       FROM sat.actividades_vec a
       JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       WHERE a.id_catalogo_actividades_vec = $1
         AND ($2::uuid IS NULL OR a.id_periodos_academicos = $2)
       GROUP BY a.id_periodos_academicos, pa.nombre, a.fecha_inicio, a.fecha_finalizacion
       ORDER BY a.fecha_inicio DESC, pa.nombre DESC, a.fecha_finalizacion DESC`,
      [filters.idActividad, filters.idPeriodo]
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.post("/asistencia/verificar", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const filters = normalizarFiltrosAsistentes(req.body || {});
  if (filters.error) return res.status(400).json({ error: filters.error });
  const sesion = normalizarFechasSesion(req.body || {});
  if (sesion.error || !sesion.fechaInicio || !sesion.fechaFinalizacion) {
    return res.status(400).json({ error: sesion.error || "Selecciona una sesión con fechas válidas." });
  }
  if (!filters.idPeriodo) {
    return res.status(400).json({ error: "Selecciona el periodo académico de la sesión que estás verificando." });
  }
  if (!Array.isArray(req.body.registros) || req.body.registros.length > 10000) {
    return res.status(400).json({ error: "La lista de registros no es válida." });
  }
  const registroIds = [...new Set(req.body.registros.map(String))];
  const asistenciaVerificada = req.body.asistenciaVerificada !== false;
  if (registroIds.some((id) => !UUID_PATTERN.test(id))) {
    return res.status(400).json({ error: "La lista contiene identificadores de asistencia inválidos." });
  }

  try {
    const { rows } = await query(
      `UPDATE sat.actividades_vec_participantes avp
       SET asistencia_verificada = $6,
           asistencia_verificada_en = CASE WHEN $6
             THEN COALESCE(avp.asistencia_verificada_en, now()) ELSE NULL END,
           asistencia_verificada_por = CASE WHEN $6
             THEN COALESCE(avp.asistencia_verificada_por, $7) ELSE NULL END
       FROM sat.actividades_vec a
       WHERE avp.id_actividades_vec = a.id_actividades_vec
         AND avp.id_actividades_vec_participantes = ANY($1::uuid[])
         AND a.id_catalogo_actividades_vec = $2
         AND ($3::uuid IS NULL OR a.id_periodos_academicos = $3)
         AND a.fecha_inicio = $4::date
         AND a.fecha_finalizacion = $5::date
         AND avp.asistencia_verificada IS DISTINCT FROM $6
       RETURNING avp.id_actividades_vec_participantes AS id`,
      [
        registroIds,
        filters.idActividad,
        filters.idPeriodo,
        sesion.fechaInicio,
        sesion.fechaFinalizacion,
        asistenciaVerificada,
        String(req.user.id),
      ]
    );
    res.json({ idsVerificados: rows.map((row) => row.id), totalVerificados: rows.length });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/exportar-asistentes", async (req, res, next) => {
  const filters = normalizarFiltrosAsistentes(req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const sesion = normalizarFechasSesion(req.query);
  if (sesion.error) return res.status(400).json({ error: sesion.error });

  try {
    const [assistantResult, activityResult] = await Promise.all([
      query(ASSISTANTS_QUERY, [
        filters.idActividad,
        filters.idPeriodo,
        filters.busqueda,
        sesion.fechaInicio,
        sesion.fechaFinalizacion,
      ]),
      query(
        `SELECT cat.actividad, pa.nombre AS periodo
         FROM sat.catalogo_actividades_vec cat
         LEFT JOIN sat.periodos_academicos pa
           ON pa.id_periodos_academicos = $2
         WHERE cat.id_catalogo_actividades_vec = $1
           AND cat.tipo_registro = 'ACTIVIDAD'
         LIMIT 1`,
        [filters.idActividad, filters.idPeriodo]
      ),
    ]);
    const activity = activityResult.rows[0];
    if (!activity) {
      return res.status(404).json({ error: "La actividad seleccionada no existe en el catálogo." });
    }

    const output = await generarExcelAsistentes(
      assistantResult.rows,
      activity.periodo || "TODOS LOS PERIODOS",
    );
    const filename = `asistentes-${slugArchivo(activity.actividad)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(output);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/catalogo-maestro", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_catalogo_actividades_vec AS id,
              hoja_origen AS "hojaOrigen",
              fila_origen AS "filaOrigen",
              actividad,
              descripcion,
              tipo_actividad AS "tipoActividad",
              proyecto,
              programa,
              componente,
              linea_accion AS "lineaAccion"
       FROM sat.catalogo_actividades_vec
       WHERE tipo_registro = 'ACTIVIDAD'
       ORDER BY linea_accion NULLS LAST, componente NULLS LAST,
                programa NULLS LAST, proyecto NULLS LAST, actividad`,
      []
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/catalogos-estudiante", async (req, res, next) => {
  try {
    const [periodos, dependencias, tiposApoyo] = await Promise.all([
      query(
        `SELECT id_periodos_academicos AS id, nombre, activo
         FROM sat.periodos_academicos
         ORDER BY activo DESC, fecha_inicio DESC NULLS LAST, nombre`
      ),
      query(
        `SELECT id_dependencias AS id, nombre
         FROM sat.dependencias
         WHERE activo = true
         ORDER BY nombre`
      ),
      query(
        `SELECT id_tipos_apoyo AS id, nombre
         FROM sat.tipos_apoyo
         WHERE activo = true
         ORDER BY numero, nombre`
      )
    ]);

    res.json({
      periodos: periodos.rows,
      dependencias: dependencias.rows,
      tiposApoyo: tiposApoyo.rows
    });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/registros-estudiante", async (req, res, next) => {
  const limitRequested = Number.parseInt(req.query.limite, 10);
  const limit = Number.isInteger(limitRequested) ? Math.min(Math.max(limitRequested, 1), 100) : 50;
  try {
    const { rows } = await query(
      `SELECT a.id_actividades_vec AS id,
              COALESCE(cat.actividad, a.actividad) AS actividad,
              COALESCE(cat.proyecto, a.proyecto) AS proyecto,
              pa.nombre AS periodo,
              a.fecha_inicio,
              a.fecha_finalizacion,
              p.numero_identificacion AS identificacion,
              BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre,
                               p.primer_apellido, p.segundo_apellido)) AS estudiante,
              COALESCE(cat.programa, pb.nombre) AS programa_bienestar,
              cat.componente,
              cat.linea_accion AS linea_accion
       FROM sat.actividades_vec a
       JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       JOIN sat.participantes_vec pv
         ON pv.id_participantes_vec = avp.id_participantes_vec
        AND pv.tipo_participante = 'ESTUDIANTE'
       JOIN sat.personas p ON p.id = pv.id_personas
       LEFT JOIN sat.catalogo_actividades_vec cat
         ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
        AND cat.tipo_registro = 'ACTIVIDAD'
       LEFT JOIN sat.programas_bienestar pb
         ON pb.id_programas_bienestar = a.id_programas_bienestar
       ORDER BY a.creado_en DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/resumen", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(DISTINCT id_personas)::int AS total_participantes,
              COUNT(*) FILTER (WHERE tipo_participante = 'ESTUDIANTE')::int AS estudiantes,
              COUNT(*) FILTER (WHERE tipo_participante = 'COLABORADOR')::int AS colaboradores,
              COUNT(*) FILTER (WHERE tipo_participante = 'EGRESADO')::int AS egresados,
              COUNT(*) FILTER (WHERE tipo_participante = 'EXTERNO')::int AS externos,
              (SELECT COUNT(*)::int FROM sat.actividades_vec) AS total_actividades
       FROM sat.participantes_vec`
    );
    res.json(rows[0]);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/", async (req, res, next) => {
  const limitRequested = Number.parseInt(req.query.limite, 10);
  const limit = Number.isInteger(limitRequested) ? Math.min(Math.max(limitRequested, 1), 100) : 100;
  try {
    const { rows } = await query(
      `SELECT pv.id_participantes_vec AS id,
              pv.tipo_participante AS tipo,
              ARRAY(
                SELECT DISTINCT rol.tipo_participante
                FROM sat.participantes_vec rol
                WHERE rol.id_personas = pv.id_personas
                ORDER BY rol.tipo_participante
              ) AS roles,
              p.numero_identificacion AS identificacion,
              BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
              BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
              pv.codigo,
              COALESCE(pv.programa_academico, prog.nombre) AS programa_academico,
              pv.semestre,
              pv.dependencia,
              pv.cargo,
              COALESCE(p.correo_institucional, p.correo_electronico) AS correo,
              COALESCE(p.celular, p.telefono) AS contacto,
              pv.creado_en
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       LEFT JOIN LATERAL (
         SELECT e.id_programas_academicos
         FROM sat.estudiantes e
         WHERE e.id_personas = p.id
         ORDER BY e.id_estudiantes
         LIMIT 1
       ) estudiante ON TRUE
       LEFT JOIN sat.programas_academicos prog
         ON prog.id_programas_academicos = estudiante.id_programas_academicos
       ORDER BY pv.creado_en DESC, pv.id_participantes_vec DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/buscar", async (req, res, next) => {
  const tipo = String(req.query.tipo || "").trim().toUpperCase();
  const identificacion = String(req.query.identificacion || "").trim();
  if (!TIPOS.has(tipo)) {
    return res.status(400).json({ error: "Selecciona un tipo de participante válido." });
  }
  if (!identificacion || identificacion.length > MAX_IDENTIFICACION_LENGTH) {
    return res.status(400).json({ error: "Ingresa una identificación válida (máximo 64 caracteres)." });
  }

  try {
    const participante = await buscarParticipante(tipo, identificacion);
    if (participante) {
      const { rows } = await query(
        `SELECT DISTINCT roles.rol
         FROM (
           SELECT pv.tipo_participante AS rol
           FROM sat.participantes_vec pv
           JOIN sat.personas persona ON persona.id = pv.id_personas
           WHERE ($1::bigint IS NOT NULL AND persona.id = $1::bigint)
              OR ($2::text IS NOT NULL AND persona.numero_identificacion = $2)
           UNION
           SELECT 'ESTUDIANTE'
           WHERE EXISTS (
             SELECT 1 FROM sat.estudiantes e
             WHERE ($1::bigint IS NOT NULL AND e.id_personas = $1::bigint)
                OR ($2::text IS NOT NULL AND e.numero_documento = $2)
           )
           UNION
           SELECT 'COLABORADOR'
           WHERE EXISTS (
             SELECT 1 FROM sat.usuarios u
             WHERE u.activo = true AND u.eliminado_en IS NULL
               AND (($1::bigint IS NOT NULL AND u.id_personas = $1::bigint)
                 OR ($2::text IS NOT NULL AND u.numero_documento = $2))
           )
         ) roles
         ORDER BY roles.rol`,
        [participante.idPersona, identificacion]
      );
      participante.roles = rows.map((row) => row.rol);
      return res.json({ encontrado: true, participante });
    }

    const estudiantePrueba = tipo === "ESTUDIANTE"
      ? MOCK_DATA.estudiantes.find(
        (student) => student.documento === identificacion || student.codigo === identificacion
      )
      : null;
    if (estudiantePrueba) {
      return res.json({
        encontrado: true,
        participante: {
          id: null,
          idPersona: null,
          tipo: "ESTUDIANTE",
          roles: ["ESTUDIANTE"],
          identificacion: estudiantePrueba.documento,
          tipoDocumento: "",
          nombres: estudiantePrueba.nombres,
          apellidos: estudiantePrueba.apellidos,
          codigo: estudiantePrueba.codigo,
          programaAcademico: estudiantePrueba.programa,
          programaPosgradoDependencia: "",
          semestre: estudiantePrueba.semestre ?? "",
          jornada: "",
          dependencia: "",
          cargo: "",
          fechaNacimiento: "",
          fechaEgreso: "",
          correo: estudiantePrueba.email || "",
          contacto: estudiantePrueba.telefono || "",
          genero: "",
          etnia: "",
          municipio: "",
          discapacidad: "",
          conflictoArmado: "",
          yaRegistrado: false,
          soloDemostracion: true,
          fuente: "Datos de prueba del proyecto (MOCK_DATA)"
        }
      });
    }

    return res.json({ encontrado: false, tipo, identificacion });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.post("/registro-estudiante", (req, res, next) => (
  registrarActividad(req, res, next, "ESTUDIANTE")
));

router.post("/registro-actividad", (req, res, next) => registrarActividad(req, res, next));

async function registrarActividad(req, res, next, tipoForzado = null) {
  const participante = normalizarEntrada({
    ...req.body.participante,
    tipo: tipoForzado || req.body.participante?.tipo,
  });
  const invalidacionParticipante = validarEntrada(participante);
  if (invalidacionParticipante) return res.status(400).json({ error: invalidacionParticipante });

  const actividad = normalizarActividad(req.body.actividad);
  const invalidacionActividad = validarActividad(actividad);
  if (invalidacionActividad) return res.status(400).json({ error: invalidacionActividad });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows: catalogoRows } = await client.query(
      `SELECT id_catalogo_actividades_vec AS id,
              actividad, descripcion, tipo_actividad AS tipo, proyecto,
              programa, componente, linea_accion
       FROM sat.catalogo_actividades_vec
       WHERE id_catalogo_actividades_vec = $1
         AND tipo_registro = 'ACTIVIDAD'
       FOR SHARE`,
      [actividad.idCatalogoActividad]
    );
    const actividadCatalogada = catalogoRows[0];
    if (!actividadCatalogada) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Selecciona una actividad vigente del catálogo institucional." });
    }
    if (!actividadCatalogada.proyecto) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "La actividad seleccionada no tiene proyecto registrado en el catálogo." });
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [participante.identificacion]);

    let persona = await buscarPersonaPorIdentificacion(client, participante.identificacion);
    if (!persona) persona = await buscarPersonaFuente(client, participante.identificacion);
    if (!persona) {
      const nombre = dividirNombre(participante.nombres);
      const apellidos = dividirNombre(participante.apellidos);
      const { rows } = await client.query(
        `INSERT INTO sat.personas (
           numero_identificacion, primer_nombre, segundo_nombre,
           primer_apellido, segundo_apellido, genero, fecha_nacimiento,
           correo_electronico, correo_institucional, celular, telefono
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (numero_identificacion) DO NOTHING
         RETURNING id`,
        [
          participante.identificacion, nombre.primero, nombre.segundo,
          apellidos.primero, apellidos.segundo, participante.genero,
          participante.fechaNacimiento, participante.correo, participante.correoInstitucional,
          participante.celular, participante.telefono
        ]
      );
      persona = rows[0] || await buscarPersonaPorIdentificacion(client, participante.identificacion);
    }
    if (!persona?.id) {
      throw Object.assign(new Error("No se pudo resolver el estudiante en la base de datos."), { status: 409 });
    }

    let idParticipante;
    const { rows: participantesExistentes } = await client.query(
      `SELECT id_participantes_vec
       FROM sat.participantes_vec
       WHERE id_personas = $1 AND tipo_participante = $2
       LIMIT 1`,
      [persona.id, participante.tipo]
    );
    if (participantesExistentes[0]) {
      idParticipante = participantesExistentes[0].id_participantes_vec;
      await client.query(
        `UPDATE sat.participantes_vec
         SET tipo_documento = COALESCE(NULLIF($2, ''), NULLIF(tipo_documento, '')),
             codigo = COALESCE(NULLIF(codigo, ''), $3),
             programa_academico = COALESCE(NULLIF(programa_academico, ''), $4),
             programa_posgrado_dependencia = COALESCE(NULLIF(programa_posgrado_dependencia, ''), $5),
             semestre = COALESCE(semestre, $6),
             jornada = COALESCE(NULLIF(jornada, ''), $7),
             etnia = COALESCE(NULLIF(etnia, ''), $8),
             municipio = COALESCE(NULLIF(municipio, ''), $9),
             discapacidad = COALESCE(NULLIF(discapacidad, ''), $10),
             conflicto_armado = COALESCE(NULLIF(conflicto_armado, ''), $11),
             dependencia = COALESCE(NULLIF(dependencia, ''), $12),
             cargo = COALESCE(NULLIF(cargo, ''), $13),
             fecha_egreso = COALESCE(fecha_egreso, $14),
             actualizado_en = now()
         WHERE id_participantes_vec = $1`,
        [
          idParticipante, participante.tipoDocumento, participante.codigo,
          participante.programaAcademico, participante.programaPosgradoDependencia,
          participante.semestre, participante.jornada, participante.etnia,
          participante.municipio, participante.discapacidad, participante.conflictoArmado,
          participante.dependencia, participante.cargo, participante.fechaEgreso,
        ]
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO sat.participantes_vec (
           id_personas, tipo_participante, tipo_documento, codigo,
           programa_academico, programa_posgrado_dependencia, semestre,
           jornada, etnia, municipio, discapacidad, conflicto_armado,
           dependencia, cargo, fecha_egreso
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id_participantes_vec`,
        [
          persona.id, participante.tipo, participante.tipoDocumento, participante.codigo,
          participante.programaAcademico, participante.programaPosgradoDependencia,
          participante.semestre, participante.jornada, participante.etnia,
          participante.municipio, participante.discapacidad, participante.conflictoArmado,
          participante.dependencia, participante.cargo, participante.fechaEgreso,
        ]
      );
      idParticipante = rows[0].id_participantes_vec;
    }

    const sesionLock = [
      actividad.idCatalogoActividad,
      actividad.idPeriodo,
      actividad.fechaInicio,
      actividad.fechaFinalizacion,
      persona.id,
    ].join(":");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sesionLock]);
    const { rowCount: yaVinculada } = await client.query(
      `SELECT 1
       FROM sat.actividades_vec_participantes avp
       JOIN sat.actividades_vec a ON a.id_actividades_vec = avp.id_actividades_vec
       JOIN sat.participantes_vec pv ON pv.id_participantes_vec = avp.id_participantes_vec
       WHERE pv.id_personas = $1
         AND a.id_catalogo_actividades_vec = $2
         AND a.id_periodos_academicos = $3
         AND a.fecha_inicio = $4
         AND a.fecha_finalizacion = $5
       LIMIT 1`,
      [
        persona.id,
        actividad.idCatalogoActividad,
        actividad.idPeriodo,
        actividad.fechaInicio,
        actividad.fechaFinalizacion,
      ]
    );
    if (yaVinculada) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "La persona ya está vinculada a esta actividad en esas fechas, con otro rol o tipo de apoyo.",
      });
    }

    const { rows: actividades } = await client.query(
      `INSERT INTO sat.actividades_vec (
         id_periodos_academicos, id_catalogo_actividades_vec,
         actividad, descripcion_actividad, proyecto,
         tipo_actividad, tipo_actividad_otra, alianza_interinstitucional,
         entidad_alianza, articulacion_institucional, id_dependencias,
         dependencia_otra, modalidad, fecha_inicio, fecha_finalizacion,
         id_programas_bienestar, estrategia_politica_bienestar,
         estrategia_politica_permanencia, estrategia_politica_educacion_inclusiva
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, NULL, $16, $17, $18
       )
       RETURNING id_actividades_vec`,
      [
        actividad.idPeriodo, actividadCatalogada.id,
        actividadCatalogada.actividad, actividadCatalogada.descripcion,
        actividadCatalogada.proyecto, actividadCatalogada.tipo, actividad.tipoOtra,
        actividad.alianza, actividad.entidadAlianza, actividad.articulacion,
        actividad.idDependencia, actividad.dependenciaOtra, actividad.modalidad,
        actividad.fechaInicio, actividad.fechaFinalizacion,
        actividad.estrategiaBienestar,
        actividad.estrategiaPermanencia, actividad.estrategiaInclusiva
      ]
    );
    const idActividad = actividades[0].id_actividades_vec;

    const { rows: registro } = await client.query(
      `INSERT INTO sat.actividades_vec_participantes (
         id_actividades_vec, id_participantes_vec, id_tipos_apoyo
       ) VALUES ($1, $2, $3)
       RETURNING id_actividades_vec_participantes`,
      [
        idActividad,
        idParticipante,
        actividad.idTipoApoyo,
      ]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      id: registro[0].id_actividades_vec_participantes,
      idActividad,
      idParticipante,
      rolParticipacion: participante.tipo,
      mensaje: `Registro de actividad guardado correctamente con el rol ${participante.tipo}.`
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
}

router.post("/", async (req, res, next) => {
  const payload = normalizarEntrada(req.body);
  const invalidacion = validarEntrada(payload);
  if (invalidacion) return res.status(400).json({ error: invalidacion });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [payload.identificacion]);

    let persona = await buscarPersonaPorIdentificacion(client, payload.identificacion);
    if (!persona) {
      persona = await buscarPersonaFuente(client, payload.identificacion);
    }
    if (!persona) {
      const nombre = dividirNombre(payload.nombres);
      const apellidos = dividirNombre(payload.apellidos);
      const { rows } = await client.query(
        `INSERT INTO sat.personas (
           numero_identificacion, primer_nombre, segundo_nombre,
           primer_apellido, segundo_apellido, genero, fecha_nacimiento,
           correo_electronico, correo_institucional, celular, telefono
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (numero_identificacion) DO NOTHING
         RETURNING id`,
        [
          payload.identificacion, nombre.primero, nombre.segundo,
          apellidos.primero, apellidos.segundo, payload.genero,
          payload.fechaNacimiento, payload.correo, payload.correoInstitucional,
          payload.celular, payload.telefono
        ]
      );
      persona = rows[0] || await buscarPersonaPorIdentificacion(client, payload.identificacion);
    }

    if (!persona?.id) {
      throw Object.assign(new Error("No se pudo resolver la persona en la base de datos."), { status: 409 });
    }

    const { rows: existente } = await client.query(
      `SELECT id_participantes_vec
       FROM sat.participantes_vec
       WHERE id_personas = $1 AND tipo_participante = $2
       LIMIT 1`,
      [persona.id, payload.tipo]
    );
    if (existente.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Ya existe un participante con esta identificación para el tipo seleccionado." });
    }

    const { rows } = await client.query(
      `INSERT INTO sat.participantes_vec (
         id_personas, tipo_participante, tipo_documento, codigo,
         programa_academico, programa_posgrado_dependencia, semestre,
         jornada, dependencia, cargo, fecha_egreso, etnia, municipio,
         discapacidad, conflicto_armado
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       )
       RETURNING id_participantes_vec`,
      [
        persona.id, payload.tipo, payload.tipoDocumento, payload.codigo,
        payload.programaAcademico, payload.programaPosgradoDependencia,
        payload.semestre, payload.jornada, payload.dependencia, payload.cargo,
        payload.fechaEgreso, payload.etnia, payload.municipio,
        payload.discapacidad, payload.conflictoArmado
      ]
    );

    await client.query("COMMIT");
    const participante = {
      id: rows[0].id_participantes_vec,
      idPersona: persona.id,
      ...payload,
      contacto: payload.celular || payload.telefono || "",
      yaRegistrado: true,
      fuente: "sat.participantes_vec"
    };
    return res.status(201).json({
      ok: true,
      id: rows[0].id_participantes_vec,
      participante
    });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch((rollbackError) => {
        console.error("No se pudo revertir el registro del participante:", rollbackError);
      });
    }
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ya existe un participante con esta identificación para el tipo seleccionado." });
    }
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

async function buscarParticipante(tipo, identificacion) {
  if (tipo === "ESTUDIANTE") {
    const { rows } = await query(
      `SELECT
         per.id AS "idPersona",
         'ESTUDIANTE' AS tipo,
         COALESCE(per.numero_identificacion, e.numero_documento) AS identificacion,
         COALESCE(pv.tipo_documento, e.tipo_documento) AS "tipoDocumento",
         COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''), e.nombres) AS nombres,
         COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''), e.apellidos) AS apellidos,
         COALESCE(m.codigo_externo, e.codigo_externo, pv.codigo) AS codigo,
         COALESCE(prog.nombre, pv.programa_academico) AS "programaAcademico",
         pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
         COALESCE(m.semestre, e.semestre_actual, pv.semestre) AS semestre,
         COALESCE(m.jornada, pv.jornada) AS jornada,
         periodo.nombre AS periodo,
         pv.dependencia,
         COALESCE(per.cargo, pv.cargo) AS cargo,
         per.genero,
         per.fecha_nacimiento AS "fechaNacimiento",
         COALESCE(e.correo_institucional, e.correo_personal,
                  per.correo_institucional, per.correo_electronico) AS correo,
         COALESCE(per.celular, per.telefono, e.telefono, e.telefono_fijo) AS contacto,
         COALESCE(e.etnia, pv.etnia) AS etnia,
         pv.municipio,
         COALESCE(per.victima_conflicto, pv.conflicto_armado) AS "conflictoArmado",
         pv.discapacidad,
         pv.fecha_egreso AS "fechaEgreso",
         pv.tipo_participante AS "tipoRegistrado",
         (pv.id_participantes_vec IS NOT NULL) AS "yaRegistrado"
       FROM sat.estudiantes e
       LEFT JOIN LATERAL (
         SELECT p.*
         FROM sat.personas p
         WHERE p.id = e.id_personas OR p.numero_identificacion = e.numero_documento
         ORDER BY (p.id = e.id_personas) DESC
         LIMIT 1
       ) per ON TRUE
       LEFT JOIN LATERAL (
         SELECT m.*
         FROM sat.matriculas m
         WHERE m.id_estudiantes = e.id_estudiantes
         ORDER BY (UPPER(COALESCE(m.estado, '')) = 'ACTIVA') DESC, m.id_matriculas DESC
         LIMIT 1
       ) m ON TRUE
       LEFT JOIN sat.programas_academicos prog
         ON prog.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
       LEFT JOIN sat.periodos_academicos periodo
         ON periodo.id_periodos_academicos = m.id_periodos_academicos
       LEFT JOIN sat.participantes_vec pv
         ON pv.id_personas = per.id
        AND pv.tipo_participante = 'ESTUDIANTE'
       WHERE e.numero_documento = $1
          OR e.codigo_externo = $1
          OR EXISTS (
            SELECT 1
            FROM sat.matriculas matricula_busqueda
            WHERE matricula_busqueda.id_estudiantes = e.id_estudiantes
              AND matricula_busqueda.codigo_externo = $1
          )
       LIMIT 1`,
      [identificacion]
    );
    return rows[0] ? mapearParticipante(rows[0], "sat.estudiantes") : null;
  }

  if (tipo === "COLABORADOR") {
    const { rows } = await query(
      `SELECT
         per.id AS "idPersona",
         'COLABORADOR' AS tipo,
         COALESCE(per.numero_identificacion, u.numero_documento) AS identificacion,
         pv.tipo_documento AS "tipoDocumento",
         COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''), u.nombres) AS nombres,
         COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''), u.apellidos) AS apellidos,
         pv.codigo,
         COALESCE(prog.nombre, pv.programa_academico) AS "programaAcademico",
         pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
         NULL::smallint AS semestre,
         NULL::text AS jornada,
         pv.dependencia,
         COALESCE(per.cargo, pv.cargo) AS cargo,
         per.genero,
         per.fecha_nacimiento AS "fechaNacimiento",
         COALESCE(per.correo_institucional, u.correo_institucional, per.correo_electronico) AS correo,
         COALESCE(per.celular, per.telefono) AS contacto,
         pv.etnia,
         pv.municipio,
         pv.discapacidad,
         pv.conflicto_armado AS "conflictoArmado",
         pv.fecha_egreso AS "fechaEgreso",
         pv.tipo_participante AS "tipoRegistrado",
         (pv.id_participantes_vec IS NOT NULL) AS "yaRegistrado"
       FROM sat.usuarios u
       LEFT JOIN LATERAL (
         SELECT p.*
         FROM sat.personas p
         WHERE p.id = u.id_personas OR p.numero_identificacion = u.numero_documento
         ORDER BY (p.id = u.id_personas) DESC
         LIMIT 1
       ) per ON TRUE
       LEFT JOIN sat.docentes d ON d.id_usuarios = u.id_usuarios
       LEFT JOIN sat.programas_academicos prog ON prog.id_programas_academicos = d.id_programas_academicos
       LEFT JOIN sat.participantes_vec pv
         ON pv.id_personas = per.id
        AND pv.tipo_participante = 'COLABORADOR'
       WHERE u.numero_documento = $1
         AND u.activo = true AND u.eliminado_en IS NULL
       LIMIT 1`,
      [identificacion]
    );
    if (rows[0]) return mapearParticipante(rows[0], "sat.usuarios");
  }

  if (tipo !== "ESTUDIANTE") {
    const { rows } = await query(
      `SELECT p.id AS "idPersona", $2::text AS tipo, p.numero_identificacion AS identificacion,
              pv.tipo_documento AS "tipoDocumento",
              BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
              BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
              pv.codigo, pv.programa_academico AS "programaAcademico",
              pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
              pv.semestre, pv.jornada, pv.dependencia, pv.cargo,
              p.genero, p.fecha_nacimiento AS "fechaNacimiento",
              COALESCE(p.correo_institucional, p.correo_electronico) AS correo,
              COALESCE(p.celular, p.telefono) AS contacto,
              pv.etnia, pv.municipio, pv.discapacidad,
              pv.conflicto_armado AS "conflictoArmado", pv.fecha_egreso AS "fechaEgreso",
              pv.tipo_participante AS "tipoRegistrado",
              (pv.id_participantes_vec IS NOT NULL) AS "yaRegistrado"
       FROM sat.personas p
       JOIN sat.participantes_vec pv
         ON pv.id_personas = p.id
        AND pv.tipo_participante = $2
       WHERE p.numero_identificacion = $1
       LIMIT 1`,
      [identificacion, tipo]
    );
    if (rows[0]) return mapearParticipante(rows[0], "sat.personas");
  }
  return null;
}

async function buscarPersonaPorIdentificacion(client, identificacion) {
  const { rows } = await client.query(
    `SELECT id, numero_identificacion AS identificacion,
            primer_nombre, segundo_nombre, primer_apellido, segundo_apellido
     FROM sat.personas
     WHERE numero_identificacion = $1
     LIMIT 1`,
    [identificacion]
  );
  return rows[0] || null;
}

async function buscarPersonaFuente(client, identificacion) {
  let perfil = null;
  const { rows: estudiantes } = await client.query(
    `SELECT e.id_personas AS id_persona, e.tipo_documento,
            e.nombres, e.apellidos, e.correo_institucional, e.telefono, e.telefono_fijo,
            e.genero, e.fecha_nacimiento, e.numero_documento AS identificacion
     FROM sat.estudiantes e
     WHERE e.numero_documento = $1
     LIMIT 1`,
    [identificacion]
  );
  perfil = estudiantes[0] || null;

  if (!perfil) {
    const { rows: colaboradores } = await client.query(
      `SELECT u.id_personas AS id_persona, u.nombres, u.apellidos,
              u.correo_institucional, u.numero_documento AS identificacion
       FROM sat.usuarios u
       WHERE u.numero_documento = $1
         AND u.activo = true AND u.eliminado_en IS NULL
       LIMIT 1`,
      [identificacion]
    );
    perfil = colaboradores[0] || null;
  }
  if (!perfil) return null;
  if (perfil.id_persona) {
    return { id: perfil.id_persona, identificacion };
  }

  const nombres = dividirNombre(perfil.nombres || "");
  const apellidos = dividirNombre(perfil.apellidos || "");
  const { rows } = await client.query(
    `INSERT INTO sat.personas (
       numero_identificacion, primer_nombre, segundo_nombre,
       primer_apellido, segundo_apellido, genero, fecha_nacimiento,
       correo_institucional, telefono, celular
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (numero_identificacion) DO UPDATE
       SET numero_identificacion = EXCLUDED.numero_identificacion
     RETURNING id`,
    [
      identificacion, nombres.primero, nombres.segundo,
      apellidos.primero, apellidos.segundo,
      perfil.genero || null, perfil.fecha_nacimiento || null,
      perfil.correo_institucional || null, perfil.telefono_fijo || perfil.telefono || null,
      perfil.telefono || null
    ]
  );
  return rows[0] ? { id: rows[0].id, identificacion } : null;
}

function normalizarEntrada(body = {}) {
  const clean = (value) => value == null ? null : String(value).trim() || null;
  return {
    tipo: clean(body.tipo)?.toUpperCase(),
    identificacion: clean(body.identificacion),
    tipoDocumento: clean(body.tipoDocumento),
    nombres: clean(body.nombres),
    apellidos: clean(body.apellidos),
    codigo: clean(body.codigo),
    programaAcademico: clean(body.programaAcademico),
    programaPosgradoDependencia: clean(body.programaPosgradoDependencia),
    semestre: body.semestre == null || body.semestre === "" ? null : Number(body.semestre),
    jornada: clean(body.jornada),
    dependencia: clean(body.dependencia),
    cargo: clean(body.cargo),
    fechaNacimiento: clean(body.fechaNacimiento),
    fechaEgreso: clean(body.fechaEgreso),
    correo: clean(body.correo),
    correoInstitucional: clean(body.correoInstitucional),
    celular: clean(body.celular),
    telefono: clean(body.telefono),
    genero: clean(body.genero),
    etnia: clean(body.etnia),
    municipio: clean(body.municipio),
    discapacidad: clean(body.discapacidad),
    conflictoArmado: clean(body.conflictoArmado)
  };
}

function normalizarActividad(body = {}) {
  const clean = (value) => value == null ? null : String(value).trim() || null;
  const alianza = body.alianzaInterinstitucional;
  return {
    idPeriodo: clean(body.idPeriodo),
    idCatalogoActividad: clean(body.idCatalogoActividad),
    tipoOtra: clean(body.tipoActividadOtra),
    alianza: alianza === true || alianza === "true"
      ? true
      : alianza === false || alianza === "false" ? false : null,
    entidadAlianza: clean(body.entidadAlianza),
    articulacion: clean(body.articulacionInstitucional),
    idDependencia: clean(body.idDependencia),
    dependenciaOtra: clean(body.dependenciaOtra),
    modalidad: clean(body.modalidad),
    fechaInicio: clean(body.fechaInicio),
    fechaFinalizacion: clean(body.fechaFinalizacion),
    idTipoApoyo: clean(body.idTipoApoyo),
    estrategiaBienestar: clean(body.estrategiaPoliticaBienestar),
    estrategiaPermanencia: clean(body.estrategiaPoliticaPermanencia),
    estrategiaInclusiva: clean(body.estrategiaPoliticaEducacionInclusiva)
  };
}

function validarActividad(actividad) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const esFechaValida = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!actividad.idPeriodo || !uuidPattern.test(actividad.idPeriodo)) return "Selecciona un periodo académico válido.";
  if (!actividad.idCatalogoActividad || !uuidPattern.test(actividad.idCatalogoActividad)) return "Selecciona una actividad del catálogo institucional.";
  if (!esFechaValida(actividad.fechaInicio)) {
    return "Ingresa una fecha de inicio válida.";
  }
  if (!esFechaValida(actividad.fechaFinalizacion)) {
    return "Ingresa una fecha de finalización válida.";
  }
  if (actividad.fechaFinalizacion < actividad.fechaInicio) {
    return "La fecha de finalización no puede ser anterior a la fecha de inicio.";
  }
  if (actividad.idDependencia && !uuidPattern.test(actividad.idDependencia)) {
    return "Selecciona una dependencia válida.";
  }
  if (actividad.idTipoApoyo && !uuidPattern.test(actividad.idTipoApoyo)) {
    return "Selecciona un tipo de apoyo válido.";
  }
  return null;
}

function validarEntrada(payload) {
  if (!TIPOS.has(payload.tipo)) return "Selecciona un tipo de participante válido.";
  if (!payload.identificacion || payload.identificacion.length > MAX_IDENTIFICACION_LENGTH) {
    return "La identificación es obligatoria y debe tener máximo 64 caracteres.";
  }
  if (!payload.nombres || !payload.apellidos) return "Nombres y apellidos son obligatorios.";
  if (payload.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo)) {
    return "Ingresa un correo electrónico válido.";
  }
  if (payload.correoInstitucional && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correoInstitucional)) {
    return "Ingresa un correo institucional válido.";
  }
  if (payload.semestre !== null && (!Number.isInteger(payload.semestre) || payload.semestre < 1 || payload.semestre > 30)) {
    return "El semestre debe ser un número entre 1 y 30.";
  }
  for (const [label, value] of [["fecha de nacimiento", payload.fechaNacimiento], ["fecha de egreso", payload.fechaEgreso]]) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `La ${label} debe tener formato AAAA-MM-DD.`;
    }
  }
  return null;
}

function dividirNombre(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return { primero: parts.shift() || "", segundo: parts.join(" ") || null };
}

function mapearParticipante(row, fuente) {
  return {
    id: row.id || null,
    idPersona: row.idPersona || null,
    tipo: row.tipo,
    identificacion: row.identificacion || "",
    tipoDocumento: row.tipoDocumento || "",
    nombres: row.nombres || "",
    apellidos: row.apellidos || "",
    codigo: row.codigo || "",
    programaAcademico: row.programaAcademico || "",
    programaPosgradoDependencia: row.programaPosgradoDependencia || "",
    periodo: row.periodo || "",
    semestre: row.semestre ?? "",
    jornada: row.jornada || "",
    dependencia: row.dependencia || "",
    cargo: row.cargo || "",
    fechaNacimiento: row.fechaNacimiento || "",
    fechaEgreso: row.fechaEgreso || "",
    correo: row.correo || "",
    contacto: row.contacto || "",
    genero: row.genero || "",
    etnia: row.etnia || "",
    municipio: row.municipio || "",
    discapacidad: row.discapacidad || "",
    conflictoArmado: row.conflictoArmado || "",
    yaRegistrado: Boolean(row.yaRegistrado),
    tipoRegistrado: row.tipoRegistrado || "",
    fuente
  };
}

function normalizarFiltrosAsistentes(params) {
  const idActividad = String(params.idActividad || "").trim();
  const idPeriodo = String(params.idPeriodo || "").trim() || null;
  const busqueda = String(params.busqueda || "").trim() || null;

  if (!UUID_PATTERN.test(idActividad)) {
    return { error: "Selecciona una actividad válida del catálogo." };
  }
  if (idPeriodo && !UUID_PATTERN.test(idPeriodo)) {
    return { error: "Selecciona un periodo académico válido." };
  }
  if (busqueda && busqueda.length > 100) {
    return { error: "La búsqueda de asistentes no puede superar 100 caracteres." };
  }

  return { idActividad, idPeriodo, busqueda };
}

function normalizarFechasSesion(params) {
  const fechaInicio = String(params.fechaInicio || "").trim() || null;
  const fechaFinalizacion = String(params.fechaFinalizacion || "").trim() || null;
  const esFechaValida = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };

  if (Boolean(fechaInicio) !== Boolean(fechaFinalizacion)) {
    return { error: "La sesión requiere fecha de inicio y finalización." };
  }
  if (fechaInicio && (!esFechaValida(fechaInicio) || !esFechaValida(fechaFinalizacion))) {
    return { error: "Selecciona fechas válidas para la sesión." };
  }
  return { fechaInicio, fechaFinalizacion };
}

function slugArchivo(value) {
  return String(value || "actividad")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "actividad";
}

function enviarErrorBaseDatos(err, res, next) {
  if (err.code === "42P01") {
    if (err.message?.includes("apoyos_financieros")) {
      return res.status(503).json({
        error: "La tabla sat.apoyos_financieros no está disponible. Verifica que la sincronización financiera institucional esté configurada."
      });
    }
    return res.status(503).json({
      error: "Faltan aplicar las migraciones del módulo Actividades en server/src/features/actividades/ antes de continuar."
    });
  }
  next(err);
}

export default router;
