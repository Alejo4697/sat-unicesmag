import { Router } from "express";
import { createRequire } from "node:module";
import { pool, query } from "../../shared/db/pool.js";
import { identifyUser, requireModule, requireRole } from "../../shared/middleware/requireRole.js";
import { generarExcelAsistentes } from "./excelAsistentes.js";

const require = createRequire(import.meta.url);
const catalogoBienestarFuente = require("./bienestarCatalogo.json");
const router = Router();
const ROLES_PARTICIPANTE_VEC = new Set(["ESTUDIANTE", "EGRESADO", "COLABORADOR", "EXTERNO"]);
const TIPOS = ROLES_PARTICIPANTE_VEC;
const TIPOS_DOCUMENTO_PARTICIPANTE = new Set([
  "CC", "TI", "CE", "PA", "RC", "NIT", "PPT", "PEP", "CD", "SC", "NUIP", "OTRO",
]);
const DETALLE_ROL_PARTICIPANTE = {
  ESTUDIANTE: "Estudiante",
  EGRESADO: "Egresado no titulado",
  COLABORADOR: "Colaborador",
  EXTERNO: "Externo",
};
const ESTADOS_ACTIVIDAD = new Set(["PROGRAMADA", "EN_CURSO", "FINALIZADA", "CANCELADA"]);
const MAX_IDENTIFICACION_LENGTH = 64;
const NUMERO_TIPO_BENEFICIOS_ECONOMICOS = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOJA_REGISTRO_MANUAL = "REGISTRO MANUAL";
const UBICACIONES_ACTIVIDAD = new Set(["Campus Centro", "Campus San Damián", "Campus Santiago"]);
const bienestarFuentePorPrograma = new Map(
  catalogoBienestarFuente.map((item, index) => [item.programa, { ...item, ordenExcel: index + 1 }])
);

function obtenerProgramaGeneralBienestar(nombre) {
  const separador = nombre.indexOf(" - ");
  if (separador >= 0) return nombre.slice(0, separador).trim();
  const agregadoFinal = nombre.match(/ \((participantes|grupos?)(?=[ )])([^()]*)\)$/i);
  return agregadoFinal ? nombre.slice(0, agregadoFinal.index).trim() : nombre;
}

const etiquetasModalidadBienestar = new Map([
  ["electiva", "Electiva"],
  ["cursos cortos (participantes certificados)", "Cursos cortos (participantes certificados)"],
  ["cursos cortos (participantes no certificados)", "Cursos cortos (participantes NO certificados)"],
  ["actividades", "Actividades"],
  ["consejería", "Consejería"],
  ["vbg", "VBG"],
  ["nna", "NNA"],
  ["cursos (participantes certificados)", "Cursos (participantes certificados)"],
  ["cursos (participantes no certificados)", "Cursos (participantes NO certificados)"],
  ["grupos", "Grupos"],
  ["grupo", "Grupo"],
  ["participantes certificados", "Participantes certificados"],
  ["participantes no certificados", "Participantes NO certificados"],
]);

function etiquetaModalidadBienestar(value) {
  return etiquetasModalidadBienestar.get(String(value || "").trim().toLocaleLowerCase("es")) || value;
}

const ordenProgramaBienestar = new Map();
for (const item of catalogoBienestarFuente) {
  const general = obtenerProgramaGeneralBienestar(String(item.programa || "").trim());
  if (!ordenProgramaBienestar.has(general)) {
    ordenProgramaBienestar.set(general, ordenProgramaBienestar.size + 1);
  }
}

function listarProgramasBienestar() {
  const basePorNombre = new Map(catalogoBienestarFuente.map((item) => [
    item.programa,
    obtenerProgramaGeneralBienestar(String(item.programa || "").trim()),
  ]));
  const cantidadPorBase = new Map();
  for (const base of basePorNombre.values()) {
    const clave = base.toLocaleLowerCase("es");
    cantidadPorBase.set(clave, (cantidadPorBase.get(clave) || 0) + 1);
  }

  return catalogoBienestarFuente.map((item, index) => {
    const programaCompleto = String(item.programa || "").trim();
    const programaBase = basePorNombre.get(item.programa) || programaCompleto;
    const agrupado = (cantidadPorBase.get(programaBase.toLocaleLowerCase("es")) || 0) > 1;
    const separador = programaCompleto.indexOf(" - ");
    const programaGeneral = agrupado ? programaBase : programaCompleto;
    let subdivision = null;
    if (agrupado) {
      if (programaCompleto.toLocaleLowerCase("es") !== programaBase.toLocaleLowerCase("es")
        && separador >= 0) {
        subdivision = programaCompleto.slice(separador + 3).trim();
      } else if (programaCompleto.toLocaleLowerCase("es") !== programaBase.toLocaleLowerCase("es")) {
        subdivision = programaCompleto.slice(programaBase.length).trim()
          .replace(/^\(/, "")
          .replace(/\)$/, "");
      }
    }
    subdivision = subdivision ? etiquetaModalidadBienestar(subdivision) : null;
    const fuente = bienestarFuentePorPrograma.get(programaCompleto);
    return {
      programa: programaGeneral,
      programaCompleto,
      subdivision,
      componente: item.componente || null,
      lineaAccion: item.lineaAccion || null,
      numeroTipoApoyo: Number(fuente?.tipoApoyoExcel?.match(/Apoyo\s+(\d+)/i)?.[1]) || null,
      tipoApoyo: fuente?.tipoApoyoExcel || null,
      estrategiaPoliticaBienestar: item.estrategiaPoliticaBienestar || null,
      estrategiaPoliticaPermanencia: item.estrategiaPoliticaPermanencia || null,
      estrategiaPoliticaEducacionInclusiva: item.estrategiaPoliticaEducacionInclusiva || null,
      ordenExcel: index + 1,
      ordenPrograma: ordenProgramaBienestar.get(programaBase) || index + 1,
    };
  });
}

const ASSISTANTS_QUERY = `
  SELECT avp.id_actividades_vec_participantes AS "id",
         pv.id_personas AS "idPersona",
         pa.nombre AS "periodo",
         p.numero_identificacion AS "identificacion",
         COALESCE(pv.tipo_documento, e.tipo_documento) AS "tipoDocumento",
         COALESCE(m.codigo_externo, e.codigo_externo, pv.codigo) AS "codigo",
         BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido,
                          p.primer_nombre, p.segundo_nombre)) AS "apellidosNombres",
         BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS "nombres",
         pv.tipo_participante AS "rolParticipacion",
         COALESCE(roles.roles, ARRAY[pv.tipo_participante]) AS roles,
         COALESCE((to_jsonb(avp)->>'asistencia_verificada')::boolean, false) AS "asistenciaVerificada",
         COALESCE(
           NULLIF(to_jsonb(avp)->>'estado_asistencia', ''),
           CASE WHEN COALESCE((to_jsonb(avp)->>'asistencia_verificada')::boolean, false)
             THEN 'PRESENTE' ELSE 'PENDIENTE' END
         ) AS "asistenciaEstado",
         COALESCE(to_jsonb(avp)->>'asistencia_verificada_origen', 'MANUAL') AS "origenAsistencia",
         COALESCE(prog.nombre, pv.programa_academico) AS "programaPregrado",
         pv.programa_posgrado_dependencia AS "programaPosgrado",
         COALESCE(m.semestre, e.semestre_actual, pv.semestre)::text AS "semestre",
         COALESCE(e.genero, p.genero) AS "genero",
         COALESCE(m.jornada, pv.jornada) AS "jornada",
         COALESCE(e.correo_institucional, e.correo_personal,
                  p.correo_institucional, p.correo_electronico) AS "correo",
         COALESCE(p.celular, p.telefono, e.telefono, e.telefono_fijo) AS "contacto",
         pv.tipo_participante AS "tipoParticipante",
         COALESCE(pv.detalle_tipo_participante, CASE pv.tipo_participante
           WHEN 'ESTUDIANTE' THEN 'Estudiante'
           WHEN 'COLABORADOR' THEN 'Colaborador'
           WHEN 'EGRESADO' THEN 'Egresado no titulado'
           ELSE 'Externo' END) AS "detalleTipoParticipante",
         CASE WHEN COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) IS NULL THEN NULL
              ELSE DATE_PART('year', AGE(CURRENT_DATE, COALESCE(e.fecha_nacimiento, p.fecha_nacimiento)))::int
         END AS "edad",
         COALESCE(e.etnia, pv.etnia) AS "etnia",
         pv.municipio AS "municipio",
         COALESCE(p.victima_conflicto, pv.conflicto_armado) AS "conflictoArmado",
         pv.discapacidad AS "discapacidad",
         COALESCE(cat.actividad, a.actividad) AS "actividad",
         COALESCE(a.descripcion_actividad, cat.descripcion) AS "descripcionActividad",
         COALESCE(cat.proyecto, a.proyecto) AS "proyecto",
         COALESCE(cat.tipo_actividad, a.tipo_actividad) AS "tipoActividad",
         a.tipo_actividad_otra AS "tipoActividadOtra",
         a.alianza_interinstitucional AS "alianzaInterinstitucional",
         a.entidad_alianza AS "entidadAlianza",
         a.articulacion_institucional AS "articulacionInstitucional",
         d.nombre AS "dependencia",
         a.dependencia_otra AS "dependenciaOtra",
         a.modalidad AS "modalidad",
         a.ubicacion AS "ubicacion",
         a.fecha_inicio AS "fechaInicio",
         a.fecha_finalizacion AS "fechaFinalizacion",
         COALESCE(cat.programa, pb.nombre) AS "programaBienestar",
         COALESCE(cat.componente, cb.nombre) AS "componente",
         COALESCE(cat.linea_accion, la.nombre) AS "lineaAccion",
         a.estrategia_politica_bienestar AS "estrategiaBienestar",
         a.estrategia_politica_permanencia AS "estrategiaPermanencia",
         a.estrategia_politica_educacion_inclusiva AS "estrategiaInclusiva",
         avp.programa_modalidad AS "programaModalidad",
         ta.nombre AS "tipoApoyo",
         avp.id_tipos_apoyo AS "idTipoApoyo"
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
  LEFT JOIN sat.apoyos_actividades_vec ta ON ta.id_tipos_apoyo = avp.id_tipos_apoyo
  LEFT JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT detected.rol
      FROM (
        SELECT other_pv.tipo_participante AS rol
        FROM sat.participantes_vec other_pv
        WHERE other_pv.id_personas = p.id
        UNION ALL
        SELECT 'ESTUDIANTE' AS rol
        WHERE EXISTS (
          SELECT 1
          FROM sat.estudiantes student_role
          WHERE student_role.id_personas = p.id
             OR student_role.numero_documento = p.numero_identificacion
             OR student_role.codigo_externo = p.numero_identificacion
             OR student_role.codigo_externo = pv.codigo
             OR EXISTS (
               SELECT 1
               FROM sat.matriculas student_enrollment
               WHERE student_enrollment.id_estudiantes = student_role.id_estudiantes
                 AND student_enrollment.codigo_externo IN (
                   p.numero_identificacion,
                   pv.codigo
                 )
             )
        )
        UNION ALL
        SELECT 'COLABORADOR' AS rol
        WHERE EXISTS (
          SELECT 1
          FROM sat.usuarios employee
          WHERE (employee.id_personas = p.id
                 OR employee.numero_documento = p.numero_identificacion)
            AND employee.activo = true
            AND employee.eliminado_en IS NULL
            AND (
              EXISTS (
                SELECT 1
                FROM sat.usuarios_roles employee_role
                JOIN sat.roles institutional_role
                  ON institutional_role.id_roles = employee_role.id_roles
                WHERE employee_role.id_usuarios = employee.id_usuarios
                  AND institutional_role.activo = true
                  AND UPPER(BTRIM(institutional_role.nombre)) IN (
                    'ADMIN', 'ADMINISTRADOR', 'COLABORADOR', 'DIRECTIVO', 'DOCENTE', 'PROFESIONAL'
                  )
              )
              OR EXISTS (
                SELECT 1
                FROM sat.docentes employee_teacher
                WHERE employee_teacher.id_usuarios = employee.id_usuarios
                  AND employee_teacher.activo = true
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM sat.docentes employee_teacher
          WHERE employee_teacher.activo = true
            AND (employee_teacher.id_personas = p.id
                 OR employee_teacher.numero_documento = p.numero_identificacion)
        )
      ) detected
      WHERE detected.rol IS NOT NULL
      ORDER BY detected.rol
    ) AS roles
  ) roles ON TRUE
  WHERE ($6::boolean OR a.estado <> 'CANCELADA')
    AND a.id_actividades_vec = $1
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
  ORDER BY ta.numero NULLS LAST, LOWER(COALESCE(ta.nombre, '')),
           "apellidosNombres", p.numero_identificacion, pv.tipo_participante`;

function asistentesSinIdPersona(asistentes) {
  const asistentesPorPersona = new Map();
  for (const asistente of asistentes) {
    const key = String(asistente.idPersona || asistente.identificacion || asistente.id);
    const existente = asistentesPorPersona.get(key);
    if (!existente) {
      asistentesPorPersona.set(key, {
        ...asistente,
        roles: [...new Set([...(asistente.roles || []), asistente.rolParticipacion].filter(Boolean))],
        estadosAsistencia: new Set([asistente.asistenciaEstado]),
      });
      continue;
    }
    existente.roles = [...new Set([
      ...existente.roles,
      ...(asistente.roles || []),
      asistente.rolParticipacion,
    ].filter(Boolean))];
    existente.estadosAsistencia.add(asistente.asistenciaEstado);
  }

  return [...asistentesPorPersona.values()].map(({ idPersona, estadosAsistencia, ...asistente }) => {
    const estados = [...estadosAsistencia];
    const asistenciaEstado = estados.length === 1 ? estados[0] : "PENDIENTE";
    return {
      ...asistente,
      asistenciaEstado,
      asistenciaVerificada: asistenciaEstado === "PRESENTE",
    };
  });
}

router.use(identifyUser, requireModule("actividades"));

router.get("/actividades-disponibles", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id_actividades_vec AS id,
             COALESCE(cat.actividad, a.actividad) AS actividad,
             COALESCE(cat.descripcion, a.descripcion_actividad) AS descripcion,
             COALESCE(cat.tipo_actividad, a.tipo_actividad) AS "tipoActividad",
             COALESCE(cat.proyecto, a.proyecto) AS proyecto,
             COALESCE(cat.programa, pb.nombre) AS programa,
             COALESCE(cat.componente, cb.nombre) AS componente,
             cat.linea_accion AS "lineaAccion",
             COALESCE(cat.hoja_origen, 'Registro manual') AS "hojaOrigen",
             a.id_periodos_academicos AS "idPeriodo",
             pa.nombre AS periodo,
             jsonb_build_array(jsonb_build_object(
               'id', a.id_periodos_academicos,
               'nombre', pa.nombre
             )) AS periodos,
             a.fecha_inicio AS "fechaInicio",
             a.fecha_finalizacion AS "fechaFinalizacion",
             a.estado,
             COUNT(DISTINCT avp.id_actividades_vec_participantes)::int AS "totalAsistentes",
             COALESCE(
               jsonb_agg(DISTINCT jsonb_build_object(
                 'id', ta.id_tipos_apoyo,
                 'nombre', ta.nombre
               )) FILTER (WHERE ta.id_tipos_apoyo IS NOT NULL),
               '[]'::jsonb
             ) AS "tiposApoyo"
       FROM sat.actividades_vec a
       JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.catalogo_actividades_vec cat
         ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
        AND cat.tipo_registro = 'ACTIVIDAD'
       LEFT JOIN sat.programas_bienestar pb
         ON pb.id_programas_bienestar = a.id_programas_bienestar
       LEFT JOIN sat.componentes_bienestar cb
         ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.apoyos_actividades_vec ta
         ON ta.id_tipos_apoyo = avp.id_tipos_apoyo
       WHERE a.estado <> 'CANCELADA'
       GROUP BY a.id_actividades_vec, cat.actividad, a.actividad, cat.descripcion,
                a.descripcion_actividad, cat.tipo_actividad, a.tipo_actividad,
                cat.proyecto, a.proyecto, cat.programa, pb.nombre, cat.componente,
                cb.nombre, cat.linea_accion, cat.hoja_origen, a.id_periodos_academicos,
                pa.nombre, a.fecha_inicio, a.fecha_finalizacion, a.estado
       ORDER BY actividad, pa.nombre, a.fecha_inicio, a.fecha_finalizacion`
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/eventos-proximos", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT (ARRAY_AGG(a.id_actividades_vec ORDER BY a.creado_en, a.id_actividades_vec))[1] AS id,
              cat.id_catalogo_actividades_vec AS "idCatalogoActividad",
              a.id_periodos_academicos AS "idPeriodo",
              pa.nombre AS periodo,
              COALESCE(cat.actividad, a.actividad) AS actividad,
              COALESCE(cat.descripcion, a.descripcion_actividad) AS descripcion,
              (ARRAY_AGG(COALESCE(cat.tipo_actividad, a.tipo_actividad)
                         ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "tipoActividad",
              COALESCE(cat.proyecto, (ARRAY_AGG(a.proyecto
                         ORDER BY a.creado_en, a.id_actividades_vec))[1]) AS proyecto,
              COALESCE(cat.programa, pb.nombre) AS "programaBienestar",
              COALESCE(cat.componente, cb.nombre) AS componente,
              cat.linea_accion AS "lineaAccion",
              cat.hoja_origen AS "hojaOrigen",
              a.fecha_inicio AS "fechaInicio",
              a.fecha_finalizacion AS "fechaFinalizacion",
              a.estado,
              (ARRAY_AGG(a.tipo_actividad_otra ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "tipoActividadOtra",
              (ARRAY_AGG(a.alianza_interinstitucional ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "alianzaInterinstitucional",
              (ARRAY_AGG(a.entidad_alianza ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "entidadAlianza",
              (ARRAY_AGG(a.articulacion_institucional ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "articulacionInstitucional",
              (ARRAY_AGG(a.id_dependencias ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "idDependencia",
              (ARRAY_AGG(a.dependencia_otra ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "dependenciaOtra",
              (ARRAY_AGG(a.modalidad ORDER BY a.creado_en, a.id_actividades_vec))[1] AS modalidad,
              (ARRAY_AGG(a.ubicacion ORDER BY a.creado_en, a.id_actividades_vec))[1] AS ubicacion,
              (ARRAY_AGG(a.estrategia_politica_bienestar ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "estrategiaPoliticaBienestar",
              (ARRAY_AGG(a.estrategia_politica_permanencia ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "estrategiaPoliticaPermanencia",
              (ARRAY_AGG(a.estrategia_politica_educacion_inclusiva ORDER BY a.creado_en, a.id_actividades_vec))[1] AS "estrategiaPoliticaEducacionInclusiva",
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'programaCompleto', modalidad.programa,
                  'idTipoApoyo', apoyo.id_tipos_apoyo,
                  'tipoApoyo', apoyo.nombre
                )) FILTER (WHERE modalidad.programa IS NOT NULL),
                '[]'::jsonb
              ) AS "variablesModalidades",
              COUNT(DISTINCT avp.id_actividades_vec_participantes)::int AS "totalParticipantes"
       FROM sat.actividades_vec a
       JOIN sat.catalogo_actividades_vec cat
         ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
        AND cat.tipo_registro = 'ACTIVIDAD'
       JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.programas_bienestar pb
         ON pb.id_programas_bienestar = a.id_programas_bienestar
       LEFT JOIN sat.componentes_bienestar cb
         ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.actividades_vec_modalidades modalidad
         ON modalidad.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.apoyos_actividades_vec apoyo
         ON apoyo.id_tipos_apoyo = modalidad.id_tipos_apoyo
        AND apoyo.activo = true
       GROUP BY cat.id_catalogo_actividades_vec, a.id_periodos_academicos, pa.nombre,
                COALESCE(cat.actividad, a.actividad),
                COALESCE(cat.descripcion, a.descripcion_actividad),
                cat.proyecto, COALESCE(cat.programa, pb.nombre),
                COALESCE(cat.componente, cb.nombre), cat.linea_accion, cat.hoja_origen, a.estado,
                a.fecha_inicio, a.fecha_finalizacion, a.variables_modalidades
       ORDER BY a.fecha_inicio, a.fecha_finalizacion, actividad`
    );
    const modalidadesPorPrograma = new Map(listarProgramasBienestar().map((item) => [
      item.programaCompleto,
      item,
    ]));
    res.json(rows.map((row) => ({
      ...row,
      variablesModalidades: row.variablesModalidades.map((item) => ({
        ...modalidadesPorPrograma.get(item.programaCompleto),
        programaCompleto: item.programaCompleto,
        idTipoApoyo: item.idTipoApoyo,
        tipoApoyo: bienestarFuentePorPrograma.get(item.programaCompleto)?.tipoApoyoExcel || null,
      })),
    })));
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/eventos", async (req, res, next) => {
  const estado = String(req.query.estado || "").trim().toUpperCase();
  const busqueda = String(req.query.busqueda || "").trim();
  if (estado && !ESTADOS_ACTIVIDAD.has(estado)) {
    return res.status(400).json({ error: "Selecciona un estado de actividad válido." });
  }
  try {
    const { rows } = await query(
      `SELECT a.id_actividades_vec AS id,
              a.id_periodos_academicos AS "idPeriodo",
              pa.nombre AS periodo,
              a.id_catalogo_actividades_vec AS "idCatalogoActividad",
              COALESCE(cat.actividad, a.actividad) AS actividad,
              COALESCE(a.descripcion_actividad, cat.descripcion) AS descripcion,
              COALESCE(cat.programa, pb.nombre) AS "programaBienestar",
              COALESCE(cat.componente, cb.nombre) AS "componenteBienestar",
              COALESCE(cat.proyecto, a.proyecto) AS proyecto,
              COALESCE(cat.tipo_actividad, a.tipo_actividad) AS "tipoActividad",
              a.modalidad,
              a.ubicacion,
              a.tipo_actividad_otra AS "tipoActividadOtra",
              a.alianza_interinstitucional AS "alianzaInterinstitucional",
              a.entidad_alianza AS "entidadAlianza",
              a.articulacion_institucional AS "articulacionInstitucional",
              a.id_dependencias AS "idDependencia",
              a.dependencia_otra AS "dependenciaOtra",
              a.estrategia_politica_bienestar AS "estrategiaPoliticaBienestar",
              a.estrategia_politica_permanencia AS "estrategiaPoliticaPermanencia",
              a.estrategia_politica_educacion_inclusiva AS "estrategiaPoliticaEducacionInclusiva",
              a.variables_modalidades AS "variablesModalidades",
              COALESCE(
                jsonb_agg(DISTINCT jsonb_build_object(
                  'programaCompleto', avm.programa,
                  'idTipoApoyo', avm.id_tipos_apoyo,
                  'tipoApoyo', ta.nombre
                )) FILTER (WHERE avm.programa IS NOT NULL),
                '[]'::jsonb
              ) AS "apoyosModalidades",
              a.fecha_inicio AS "fechaInicio",
              a.fecha_finalizacion AS "fechaFinalizacion",
              a.estado,
              a.creado_en AS "creadoEn",
              a.actualizado_en AS "actualizadoEn",
              COUNT(DISTINCT avp.id_actividades_vec_participantes)::int AS "totalParticipantes"
       FROM sat.actividades_vec a
       JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.catalogo_actividades_vec cat
         ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
        AND cat.tipo_registro = 'ACTIVIDAD'
       LEFT JOIN sat.programas_bienestar pb
         ON pb.id_programas_bienestar = a.id_programas_bienestar
       LEFT JOIN sat.componentes_bienestar cb
         ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.actividades_vec_modalidades avm
         ON avm.id_actividades_vec = a.id_actividades_vec
       LEFT JOIN sat.apoyos_actividades_vec ta
         ON ta.id_tipos_apoyo = avm.id_tipos_apoyo
       WHERE ($1::text = '' OR a.estado = $1)
         AND ($2::text = '' OR COALESCE(cat.actividad, a.actividad) ILIKE '%' || $2 || '%'
              OR COALESCE(cat.programa, pb.nombre, '') ILIKE '%' || $2 || '%'
              OR COALESCE(cat.componente, cb.nombre, '') ILIKE '%' || $2 || '%'
              OR COALESCE(cat.proyecto, a.proyecto) ILIKE '%' || $2 || '%'
              OR pa.nombre ILIKE '%' || $2 || '%')
       GROUP BY a.id_actividades_vec, pa.nombre, cat.actividad, cat.descripcion,
                cat.programa, pb.nombre, cat.componente, cb.nombre,
                cat.proyecto, cat.tipo_actividad, a.variables_modalidades
       ORDER BY a.fecha_inicio DESC, a.creado_en DESC
       LIMIT 500`,
      [estado, busqueda]
    );
    res.json(rows.map((row) => ({
      ...row,
      tipoApoyoPrograma: bienestarFuentePorPrograma.get(row.programaBienestar)?.tipoApoyoExcel || null,
    })));
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.post("/eventos", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const activity = normalizarActividad(req.body || {});
  const invalid = validarActividad(activity, {
    requiereNombre: true,
  });
  if (invalid) return res.status(400).json({ error: invalid });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const event = await crearActividadTransaccion(client, activity, req.user?.id);
    await client.query("COMMIT");
    res.status(201).json(event);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.put("/eventos/:id", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  if (!UUID_PATTERN.test(String(req.params.id || ""))) return res.status(400).json({ error: "Identificador de actividad inválido." });
  const activity = normalizarActividad(req.body || {});
  const invalid = validarActividad(activity, { requiereNombre: true });
  if (invalid) return res.status(400).json({ error: invalid });
  if (activity.idEventoExistente && activity.idEventoExistente !== req.params.id) {
    return res.status(400).json({ error: "El evento del formulario no coincide con la actividad que se desea editar." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const catalog = await obtenerCatalogoActividadManual(client, activity);
    const { rows } = await client.query(
      `UPDATE sat.actividades_vec SET
         id_periodos_academicos=$2, id_catalogo_actividades_vec=$3,
         actividad=$4, descripcion_actividad=$5, proyecto=$6, tipo_actividad=COALESCE($7, tipo_actividad),
         tipo_actividad_otra=$8, alianza_interinstitucional=$9, entidad_alianza=$10,
         articulacion_institucional=$11, id_dependencias=$12, dependencia_otra=$13,
         modalidad=$14, fecha_inicio=$15, fecha_finalizacion=$16,
         id_programas_bienestar=$17, estrategia_politica_bienestar=$18,
         estrategia_politica_permanencia=$19, estrategia_politica_educacion_inclusiva=$20,
         ubicacion=$21, variables_modalidades=$22,
         actualizado_en=now()
       WHERE id_actividades_vec=$1
       RETURNING id_actividades_vec AS id, estado`,
      [req.params.id, activity.idPeriodo, catalog.id, activity.nombreActividad,
        activity.descripcion, catalog.proyecto, catalog.tipo, activity.tipoOtra,
        activity.alianza, activity.entidadAlianza, activity.articulacion,
        activity.idDependencia, activity.dependenciaOtra, activity.modalidad,
        activity.fechaInicio, activity.fechaFinalizacion, catalog.idProgramaBienestar,
        catalog.estrategiaBienestar || activity.estrategiaBienestar,
        catalog.estrategiaPermanencia || activity.estrategiaPermanencia,
        catalog.estrategiaInclusiva || activity.estrategiaInclusiva,
        activity.ubicacion, activity.subdivisionProgramas]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No existe la actividad que se desea editar." });
    }
    await guardarModalidadesActividad(client, req.params.id, catalog.modalidades);
    await client.query(
      `INSERT INTO sat.actividades_vec_auditoria (id_actividades_vec, accion, id_usuario, detalle)
       VALUES ($1, 'EDITAR', $2, $3::jsonb)`,
      [req.params.id, String(req.user?.id || ""), JSON.stringify(activity)]
    );
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.patch("/eventos/:id/estado", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  const estado = String(req.body?.estado || "").trim().toUpperCase();
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de actividad inválido." });
  if (!ESTADOS_ACTIVIDAD.has(estado)) return res.status(400).json({ error: "Estado inválido." });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE sat.actividades_vec SET estado=$2, actualizado_en=now()
       WHERE id_actividades_vec=$1 RETURNING id_actividades_vec AS id, estado`,
      [id, estado]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No existe la actividad indicada." });
    }
    await client.query(
      `INSERT INTO sat.actividades_vec_auditoria (id_actividades_vec, accion, id_usuario, detalle)
       VALUES ($1, 'CAMBIAR_ESTADO', $2, jsonb_build_object('estado', $3::text))`,
      [id, String(req.user?.id || ""), estado]
    );
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.delete("/eventos/:id", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de actividad inválido." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT a.id_actividades_vec AS id,
              COALESCE(cat.actividad, a.actividad) AS actividad
       FROM sat.actividades_vec a
       LEFT JOIN sat.catalogo_actividades_vec cat
         ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
        AND cat.tipo_registro = 'ACTIVIDAD'
       WHERE a.id_actividades_vec = $1
       FOR UPDATE OF a`,
      [id]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No existe la actividad indicada." });
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS participantes
       FROM sat.actividades_vec_participantes
       WHERE id_actividades_vec = $1`,
      [id]
    );
    await client.query(
      "DELETE FROM sat.actividades_vec WHERE id_actividades_vec = $1",
      [id]
    );
    await client.query("COMMIT");
    res.json({
      id,
      actividad: rows[0].actividad,
      inscripcionesEliminadas: countRows[0].participantes,
      mensaje: "La actividad y sus datos asociados fueron eliminados.",
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.get("/eventos/:id/participantes", async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de actividad inválido." });
  try {
    const { rows } = await query(ASSISTANTS_QUERY, [id, null, null, null, null, false]);
    res.json(asistentesSinIdPersona(rows));
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get(
  "/eventos/:id/participantes/exportar",
  requireRole("admin", "coordinador", "administrador"),
  async (req, res, next) => {
    const id = String(req.params.id || "");
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ error: "Identificador de actividad inválido." });
    }

    try {
      const [assistantResult, activityResult] = await Promise.all([
        query(ASSISTANTS_QUERY, [id, null, null, null, null, true]),
        query(
          `SELECT COALESCE(cat.actividad, a.actividad) AS actividad,
                  pa.nombre AS periodo
           FROM sat.actividades_vec a
           JOIN sat.periodos_academicos pa
             ON pa.id_periodos_academicos = a.id_periodos_academicos
           LEFT JOIN sat.catalogo_actividades_vec cat
             ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
            AND cat.tipo_registro = 'ACTIVIDAD'
           WHERE a.id_actividades_vec = $1
           LIMIT 1`,
          [id],
        ),
      ]);
      const activity = activityResult.rows[0];
      if (!activity) {
        return res.status(404).json({ error: "La actividad seleccionada no existe." });
      }

      const output = await generarExcelAsistentes(
        assistantResult.rows,
        activity.periodo || "TODOS LOS PERIODOS",
      );
      const filename = [
        "asistentes",
        slugArchivo(activity.actividad),
        slugArchivo(activity.periodo),
      ].filter(Boolean).join("-") + ".xlsx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(output);
    } catch (err) {
      return enviarErrorBaseDatos(err, res, next);
    }
  },
);

router.delete("/inscripciones/:id", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Inscripción no válida." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT avp.id_actividades_vec_participantes AS id,
              pv.id_participantes_vec AS "idParticipante",
              pv.id_personas AS "idPersona",
              pv.tipo_participante AS rol,
              p.numero_identificacion AS identificacion
       FROM sat.actividades_vec_participantes avp
       JOIN sat.participantes_vec pv
         ON pv.id_participantes_vec = avp.id_participantes_vec
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE avp.id_actividades_vec_participantes = $1
       FOR UPDATE OF avp, pv, p`,
      [id]
    );
    const inscripcion = rows[0];
    if (!inscripcion) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró la inscripción." });
    }

    await client.query(
      "DELETE FROM sat.actividades_vec_participantes WHERE id_actividades_vec_participantes = $1",
      [id]
    );

    const { rows: restantes } = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM sat.actividades_vec_participantes
       WHERE id_participantes_vec = $1`,
      [inscripcion.idParticipante]
    );
    const tieneOtrasInscripciones = restantes[0].total > 0;
    let perfilEliminado = false;
    let personaEliminada = false;

    if (!tieneOtrasInscripciones && inscripcion.rol !== "ESTUDIANTE") {
      await client.query("SAVEPOINT eliminar_perfil_vec");
      try {
        const { rows: perfilesEliminados } = await client.query(
          `DELETE FROM sat.participantes_vec
           WHERE id_participantes_vec = $1
           RETURNING id_participantes_vec`,
          [inscripcion.idParticipante]
        );
        perfilEliminado = Boolean(perfilesEliminados[0]);
        await client.query("RELEASE SAVEPOINT eliminar_perfil_vec");
      } catch (err) {
        if (err.code !== "23503") throw err;
        await client.query("ROLLBACK TO SAVEPOINT eliminar_perfil_vec");
        await client.query("RELEASE SAVEPOINT eliminar_perfil_vec");
      }
    }

    if (perfilEliminado) {
      const { rows: otrosPerfiles } = await client.query(
        `SELECT 1
         FROM sat.participantes_vec
         WHERE id_personas = $1
         LIMIT 1`,
        [inscripcion.idPersona]
      );
      const { rows: fuentesInstitucionales } = await client.query(
        `SELECT (
           EXISTS (SELECT 1 FROM sat.estudiantes
                   WHERE id_personas = $1 OR numero_documento = $2)
           OR EXISTS (SELECT 1 FROM sat.usuarios
                      WHERE id_personas = $1 OR numero_documento = $2)
           OR EXISTS (SELECT 1 FROM sat.docentes
                      WHERE id_personas = $1 OR numero_documento = $2)
         ) AS vinculada`,
        [inscripcion.idPersona, inscripcion.identificacion]
      );
      const { rows: referenciasConEfectos } = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE contype = 'f'
             AND confrelid = 'sat.personas'::regclass
             AND confdeltype IN ('c', 'n', 'd')
         ) AS existe`,
      );
      if (!otrosPerfiles[0]
        && !fuentesInstitucionales[0].vinculada
        && !referenciasConEfectos[0].existe) {
        await client.query("SAVEPOINT eliminar_persona");
        try {
          const { rows: personasEliminadas } = await client.query(
            "DELETE FROM sat.personas WHERE id = $1 RETURNING id",
            [inscripcion.idPersona]
          );
          personaEliminada = Boolean(personasEliminadas[0]);
          await client.query("RELEASE SAVEPOINT eliminar_persona");
        } catch (err) {
          if (err.code !== "23503") throw err;
          await client.query("ROLLBACK TO SAVEPOINT eliminar_persona");
          await client.query("RELEASE SAVEPOINT eliminar_persona");
        }
      }
    }

    const mensaje = ["Se eliminó la inscripción de la actividad."];
    if (perfilEliminado) {
      mensaje.push("También se eliminó el perfil VEC y su rol.");
      mensaje.push(personaEliminada
        ? "Se eliminaron los datos de la persona porque no tenía otros vínculos."
        : "Se conservaron los datos personales porque siguen vinculados a otros registros o fuentes institucionales.");
    } else if (inscripcion.rol === "ESTUDIANTE") {
      mensaje.push("Se conservó el perfil de estudiante.");
    } else if (tieneOtrasInscripciones) {
      mensaje.push("Se conservó el perfil VEC porque tiene otras inscripciones.");
    } else {
      mensaje.push("Se conservó el perfil VEC porque está vinculado a otros registros.");
    }

    await client.query("COMMIT");
    return res.json({
      inscripcionEliminada: true,
      perfilEliminado,
      personaEliminada,
      mensaje: mensaje.join(" "),
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.patch("/inscripciones/:id/apoyo", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  const idTipoApoyo = String(req.body?.idTipoApoyo || "").trim() || null;
  const motivo = String(req.body?.motivo || "").trim();
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Inscripción no válida." });
  if (idTipoApoyo && !UUID_PATTERN.test(idTipoApoyo)) return res.status(400).json({ error: "Selecciona un tipo de apoyo válido." });
  if (motivo.length < 5 || motivo.length > 500) return res.status(400).json({ error: "Explica el motivo de la corrección (entre 5 y 500 caracteres)." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    if (idTipoApoyo) {
      const { rows: supportRows } = await client.query(
        "SELECT id_tipos_apoyo FROM sat.apoyos_actividades_vec WHERE id_tipos_apoyo=$1 AND activo=true",
        [idTipoApoyo]
      );
      if (!supportRows[0]) throw Object.assign(new Error("El tipo de apoyo no existe o está inactivo."), { status: 400 });
    }
    const { rows: currentRows } = await client.query(
      `SELECT avp.id_tipos_apoyo AS anterior,
              avp.programa_modalidad AS "modalidadAnterior",
              avp.id_actividades_vec AS "idActividad"
       FROM sat.actividades_vec_participantes avp
       WHERE avp.id_actividades_vec_participantes=$1
       FOR UPDATE`,
      [id]
    );
    if (!currentRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró la inscripción." });
    }
    const anterior = currentRows[0].anterior;
    if (String(anterior || "") === String(idTipoApoyo || "")) {
      await client.query("COMMIT");
      return res.json({ id, idTipoApoyo, sinCambios: true });
    }
    let nuevaModalidad = null;
    if (idTipoApoyo) {
      const { rows: modalidades } = await client.query(
        `SELECT programa
         FROM sat.actividades_vec_modalidades
         WHERE id_actividades_vec = $1
           AND id_tipos_apoyo = $2
         ORDER BY programa`,
        [currentRows[0].idActividad, idTipoApoyo]
      );
      if (modalidades.length === 1) {
        nuevaModalidad = modalidades[0].programa;
      } else if (modalidades.some((modalidad) => modalidad.programa === currentRows[0].modalidadAnterior)) {
        nuevaModalidad = currentRows[0].modalidadAnterior;
      }
    }
    await client.query(
      `UPDATE sat.actividades_vec_participantes
       SET id_tipos_apoyo=$2, programa_modalidad=$3
       WHERE id_actividades_vec_participantes=$1`,
      [id, idTipoApoyo, nuevaModalidad]
    );
    await client.query(
      `INSERT INTO sat.actividades_vec_participantes_auditoria
         (id_actividades_vec_participantes, accion, id_usuario, detalle)
       VALUES ($1, 'EDITAR_TIPO_APOYO', $2, $3::jsonb)`,
      [id, String(req.user?.id || ""), JSON.stringify({
        anterior,
        nuevo: idTipoApoyo,
        modalidadAnterior: currentRows[0].modalidadAnterior,
        modalidadNueva: nuevaModalidad,
        motivo,
      })]
    );
    await client.query("COMMIT");
    res.json({ id, idTipoApoyo, sinCambios: false });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.get("/inscripciones/:id/auditoria", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Inscripción no válida." });
  try {
    const { rows } = await query(
      `SELECT audit.id_auditoria AS id, audit.accion, audit.id_usuario AS "usuarioId",
              audit.detalle, audit.creado_en AS "creadoEn",
              COALESCE(anterior.nombre, 'Sin clasificar') AS "tipoAnterior",
              COALESCE(nuevo.nombre, 'Sin clasificar') AS "tipoNuevo"
       FROM sat.actividades_vec_participantes_auditoria audit
       LEFT JOIN sat.apoyos_actividades_vec anterior
         ON anterior.id_tipos_apoyo = NULLIF(audit.detalle->>'anterior', '')::uuid
       LEFT JOIN sat.apoyos_actividades_vec nuevo
         ON nuevo.id_tipos_apoyo = NULLIF(audit.detalle->>'nuevo', '')::uuid
       WHERE audit.id_actividades_vec_participantes=$1
       ORDER BY audit.creado_en DESC, audit.id_auditoria DESC`,
      [id]
    );
    res.json(rows);
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
      false,
    ]);
    res.json(asistentesSinIdPersona(rows));
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
                FILTER (WHERE COALESCE((to_jsonb(avp)->>'asistencia_verificada')::boolean, false))::int AS "totalVerificados"
       FROM sat.actividades_vec a
       JOIN sat.periodos_academicos pa
         ON pa.id_periodos_academicos = a.id_periodos_academicos
       LEFT JOIN sat.actividades_vec_participantes avp
         ON avp.id_actividades_vec = a.id_actividades_vec
       WHERE a.id_actividades_vec = $1
         AND a.estado <> 'CANCELADA'
         AND ($2::uuid IS NULL OR a.id_periodos_academicos = $2)
       GROUP BY a.id_actividades_vec, a.id_periodos_academicos, pa.nombre,
                a.fecha_inicio, a.fecha_finalizacion
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
  const origen = String(req.body.origen || "MANUAL").trim().toUpperCase();
  if (!["MANUAL", "EXCEL"].includes(origen)) {
    return res.status(400).json({ error: "El origen de la verificación de asistencia no es válido." });
  }
  const registroIds = [...new Set(req.body.registros.map(String))];
  const asistenciaEstado = String(
    req.body.asistenciaEstado
    || (req.body.asistenciaVerificada === false ? "PENDIENTE" : "PRESENTE"),
  ).trim().toUpperCase();
  if (!["PENDIENTE", "PRESENTE", "AUSENTE"].includes(asistenciaEstado)) {
    return res.status(400).json({ error: "El estado de asistencia debe ser Pendiente, Presente o Ausente." });
  }
  const asistenciaVerificada = asistenciaEstado === "PRESENTE";
  if (registroIds.some((id) => !UUID_PATTERN.test(id))) {
    return res.status(400).json({ error: "La lista contiene identificadores de asistencia inválidos." });
  }

  try {
    const { rows } = await query(
      `WITH personas_seleccionadas AS (
         SELECT DISTINCT pv.id_personas
         FROM sat.actividades_vec_participantes seleccion
         JOIN sat.participantes_vec pv
           ON pv.id_participantes_vec = seleccion.id_participantes_vec
         JOIN sat.actividades_vec a
           ON a.id_actividades_vec = seleccion.id_actividades_vec
         WHERE seleccion.id_actividades_vec_participantes = ANY($1::uuid[])
           AND a.id_actividades_vec = $2
           AND a.estado <> 'CANCELADA'
           AND ($3::uuid IS NULL OR a.id_periodos_academicos = $3)
           AND a.fecha_inicio = $4::date
           AND a.fecha_finalizacion = $5::date
       )
       UPDATE sat.actividades_vec_participantes avp
       SET asistencia_verificada = $6,
           estado_asistencia = $9,
           asistencia_verificada_en = CASE WHEN $9 <> 'PENDIENTE'
             THEN CASE WHEN avp.estado_asistencia IS DISTINCT FROM $9
               THEN now() ELSE COALESCE(avp.asistencia_verificada_en, now()) END
             ELSE NULL END,
           asistencia_verificada_por = CASE WHEN $9 <> 'PENDIENTE'
             THEN CASE WHEN avp.estado_asistencia IS DISTINCT FROM $9
               THEN $7 ELSE COALESCE(avp.asistencia_verificada_por, $7) END
             ELSE NULL END,
           asistencia_verificada_origen = CASE WHEN $9 <> 'PENDIENTE' THEN $8 ELSE 'MANUAL' END
       FROM sat.actividades_vec a, sat.participantes_vec pv
       WHERE avp.id_actividades_vec = a.id_actividades_vec
         AND pv.id_participantes_vec = avp.id_participantes_vec
         AND (
           avp.id_actividades_vec_participantes = ANY($1::uuid[])
           OR pv.id_personas IN (SELECT id_personas FROM personas_seleccionadas)
         )
         AND a.id_actividades_vec = $2
         AND a.estado <> 'CANCELADA'
         AND ($3::uuid IS NULL OR a.id_periodos_academicos = $3)
         AND a.fecha_inicio = $4::date
         AND a.fecha_finalizacion = $5::date
         AND (
           avp.asistencia_verificada IS DISTINCT FROM $6
           OR avp.estado_asistencia IS DISTINCT FROM $9
         )
       RETURNING avp.id_actividades_vec_participantes AS id`,
      [
        registroIds,
        filters.idActividad,
        filters.idPeriodo,
        sesion.fechaInicio,
        sesion.fechaFinalizacion,
        asistenciaVerificada,
        String(req.user.id),
        origen,
        asistenciaEstado,
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
        false,
      ]),
      query(
        `SELECT COALESCE(cat.actividad, a.actividad) AS actividad,
                pa.nombre AS periodo
         FROM sat.actividades_vec a
         JOIN sat.periodos_academicos pa
           ON pa.id_periodos_academicos = a.id_periodos_academicos
         LEFT JOIN sat.catalogo_actividades_vec cat
           ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
          AND cat.tipo_registro = 'ACTIVIDAD'
         WHERE a.id_actividades_vec = $1
         LIMIT 1`,
        [filters.idActividad]
      ),
    ]);
    const activity = activityResult.rows[0];
    if (!activity) {
      return res.status(404).json({ error: "La actividad registrada seleccionada no existe." });
    }

    const output = await generarExcelAsistentes(
      assistantResult.rows,
      activity.periodo || "TODOS LOS PERIODOS",
    );
    const scope = [
      activity.periodo,
      sesion.fechaInicio,
      sesion.fechaFinalizacion,
    ].filter(Boolean).map(slugArchivo).join("-");
    const filename = [
      "asistentes",
      slugArchivo(activity.actividad),
      scope,
    ].filter(Boolean).join("-") + ".xlsx";
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
      `SELECT cat.id_catalogo_actividades_vec AS id,
              cat.hoja_origen AS "hojaOrigen",
              cat.fila_origen AS "filaOrigen",
              cat.actividad,
              cat.descripcion,
              cat.tipo_actividad AS "tipoActividad",
              cat.proyecto,
              cat.programa,
              cat.componente,
              cat.linea_accion AS "lineaAccion",
              bienestar.componente AS "componenteBienestar",
              bienestar.linea_accion AS "lineaBienestar",
              bienestar.estrategia_politica_bienestar AS "estrategiaPoliticaBienestar",
              bienestar.estrategia_politica_permanencia AS "estrategiaPoliticaPermanencia",
              bienestar.estrategia_politica_educacion_inclusiva AS "estrategiaPoliticaEducacionInclusiva",
              COALESCE(apoyo_excel.id_tipos_apoyo, apoyo_sugerido.id_tipos_apoyo) AS "idTipoApoyoSugerido",
              COALESCE(apoyo_excel.nombre, apoyo_sugerido.nombre) AS "rutaApoyoSugerida"
       FROM sat.catalogo_actividades_vec cat
       LEFT JOIN sat.catalogo_bienestar_actividades bienestar
         ON translate(LOWER(BTRIM(bienestar.programa)), 'áéíóúüñ', 'aeiouun') = translate(LOWER(BTRIM(cat.programa)), 'áéíóúüñ', 'aeiouun')
       LEFT JOIN LATERAL (
         SELECT r.id_tipos_apoyo, r.nombre
         FROM sat.rutas_remision r
         LEFT JOIN sat.programas_bienestar pb ON pb.id_programas_bienestar = r.id_programas_bienestar
         WHERE r.activo = true AND (
           LOWER(BTRIM(r.nombre)) = LOWER(BTRIM(COALESCE(cat.proyecto, '')))
           OR LOWER(BTRIM(r.nombre)) = LOWER(BTRIM(COALESCE(cat.actividad, '')))
           OR LOWER(BTRIM(pb.nombre)) = LOWER(BTRIM(COALESCE(cat.programa, '')))
         )
         ORDER BY CASE WHEN LOWER(BTRIM(r.nombre)) IN (
           LOWER(BTRIM(COALESCE(cat.proyecto, ''))), LOWER(BTRIM(COALESCE(cat.actividad, '')))
         ) THEN 0 ELSE 1 END, r.id_rutas_remision
         LIMIT 1
       ) apoyo_sugerido ON true
       LEFT JOIN LATERAL (
         SELECT ta.id_tipos_apoyo, ta.nombre
         FROM sat.apoyos_actividades_vec ta
         WHERE ta.activo = true AND ta.numero = bienestar.numero_tipo_apoyo
         ORDER BY ta.id_tipos_apoyo
         LIMIT 1
       ) apoyo_excel ON true
       WHERE cat.tipo_registro = 'ACTIVIDAD'
         AND cat.hoja_origen <> $1
       ORDER BY cat.linea_accion NULLS LAST, cat.componente NULLS LAST,
                cat.programa NULLS LAST, cat.proyecto NULLS LAST, cat.actividad`,
      [HOJA_REGISTRO_MANUAL]
    );
    const ordenProgramas = new Map(catalogoBienestarFuente.map((item, index) => [item.programa, index]));
    const enriquecidas = rows.map((row) => ({
      ...row,
      tipoApoyoExcel: bienestarFuentePorPrograma.get(row.programa)?.tipoApoyoExcel || null,
    }));
    enriquecidas.sort((a, b) => (
      String(a.lineaAccion || "").localeCompare(String(b.lineaAccion || ""), "es")
      || String(a.componente || "").localeCompare(String(b.componente || ""), "es")
      || (ordenProgramas.get(a.programa) ?? Number.MAX_SAFE_INTEGER)
        - (ordenProgramas.get(b.programa) ?? Number.MAX_SAFE_INTEGER)
      || String(a.proyecto || "").localeCompare(String(b.proyecto || ""), "es")
      || String(a.actividad || "").localeCompare(String(b.actividad || ""), "es")
    ));
    res.json(enriquecidas);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/catalogos-estudiante", async (req, res, next) => {
  try {
    const [periodos, dependencias, tiposApoyo, generos, etnias, municipios] = await Promise.all([
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
        `SELECT id_tipos_apoyo AS id, numero, nombre
        FROM sat.apoyos_actividades_vec
         WHERE activo = true
         ORDER BY numero, nombre`
      ),
      query(
        `SELECT DISTINCT BTRIM(valor) AS valor FROM (
           SELECT genero AS valor FROM sat.personas
           UNION ALL SELECT genero FROM sat.estudiantes
         ) valores
         WHERE NULLIF(BTRIM(valor), '') IS NOT NULL
         ORDER BY valor`
      ),
      query(
        `SELECT DISTINCT BTRIM(valor) AS valor FROM (
           SELECT etnia AS valor FROM sat.participantes_vec
           UNION ALL SELECT etnia FROM sat.estudiantes
         ) valores
         WHERE NULLIF(BTRIM(valor), '') IS NOT NULL
         ORDER BY valor`
      ),
      query(
        `SELECT DISTINCT BTRIM(valor) AS valor FROM (
           SELECT municipio AS valor FROM sat.participantes_vec
         ) valores
         WHERE NULLIF(BTRIM(valor), '') IS NOT NULL
         ORDER BY valor`
      ),
    ]);

    res.json({
      periodos: periodos.rows,
      dependencias: dependencias.rows,
      tiposApoyo: tiposApoyo.rows,
      generos: generos.rows.map((row) => row.valor),
      etnias: etnias.rows.map((row) => row.valor),
      municipios: municipios.rows.map((row) => row.valor),
      programasBienestar: listarProgramasBienestar()
    });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/apoyos/todos", async (req, res, next) => {
  const filtroTipo = String(req.query.tipoApoyo || "todos").trim();
  const idTipoApoyo = filtroTipo.toLowerCase() === "todos" ? null : filtroTipo;
  if (idTipoApoyo && !UUID_PATTERN.test(idTipoApoyo)) {
    return res.status(400).json({ error: "Selecciona un tipo de apoyo vÃ¡lido." });
  }
  const requestedPage = Number.parseInt(req.query.pagina, 10);
  const pagina = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const limite = 50;

  try {
    if (idTipoApoyo) {
      const activeType = await query(
        `SELECT id_tipos_apoyo FROM sat.apoyos_actividades_vec WHERE id_tipos_apoyo = $1 AND activo = true`,
        [idTipoApoyo]
      );
      if (!activeType.rows[0]) {
        return res.status(404).json({ error: "El tipo de apoyo seleccionado no estÃ¡ activo." });
      }
    }

    const [financieros, actividades, sinTipoApoyo] = await Promise.all([
      query(
        `SELECT e.id_estudiantes::text AS id,
                e.id_personas::text AS "idPersona",
                COALESCE(per.numero_identificacion, e.numero_documento) AS identificacion,
                BTRIM(COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''), e.nombres)) AS nombres,
                BTRIM(COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''), e.apellidos)) AS apellidos,
                e.codigo_externo AS codigo,
                ta.nombre AS "tipoApoyo",
                STRING_AGG(DISTINCT COALESCE(NULLIF(BTRIM(af.nombre_descuento), ''), NULLIF(BTRIM(af.concepto_descuento), ''), 'Apoyo sin clasificar'), ' | '
                  ORDER BY COALESCE(NULLIF(BTRIM(af.nombre_descuento), ''), NULLIF(BTRIM(af.concepto_descuento), ''), 'Apoyo sin clasificar')) AS apoyos,
                STRING_AGG(DISTINCT pa.nombre, ' | ' ORDER BY pa.nombre)
                  FILTER (WHERE pa.nombre IS NOT NULL) AS periodos,
                STRING_AGG(DISTINCT NULLIF(af.porcentaje_descuento::text, ''), ' | '
                  ORDER BY NULLIF(af.porcentaje_descuento::text, '')) FILTER (WHERE af.porcentaje_descuento IS NOT NULL) AS porcentajes,
                STRING_AGG(DISTINCT NULLIF(af.valor_descuento::text, ''), ' | '
                  ORDER BY NULLIF(af.valor_descuento::text, '')) FILTER (WHERE af.valor_descuento IS NOT NULL) AS valores,
                COALESCE(
                  (SELECT ARRAY_AGG(DISTINCT pv.tipo_participante ORDER BY pv.tipo_participante)
                   FROM sat.participantes_vec pv
                   WHERE pv.id_personas = e.id_personas),
                  ARRAY['ESTUDIANTE']::text[]
                ) AS roles,
                COUNT(*)::int AS registros,
                'Apoyo financiero'::text AS fuente,
                'Registrado en beneficios financieros'::text AS "origenClasificacion"
         FROM sat.apoyos_financieros af
         JOIN sat.estudiantes e ON e.id_estudiantes = af.id_estudiantes
         LEFT JOIN sat.personas per ON per.id = e.id_personas
         LEFT JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = af.id_periodos_academicos
         JOIN sat.tipos_apoyo ta ON ta.numero = $2 AND ta.activo = true
         WHERE ($1::uuid IS NULL OR ta.id_tipos_apoyo = $1)
         GROUP BY e.id_estudiantes, e.id_personas, per.numero_identificacion, e.numero_documento,
                  per.primer_nombre, per.segundo_nombre, e.nombres,
                  per.primer_apellido, per.segundo_apellido, e.apellidos, e.codigo_externo, ta.nombre`,
        [idTipoApoyo, NUMERO_TIPO_BENEFICIOS_ECONOMICOS]
      ),
      query(
        `SELECT avp.id_actividades_vec_participantes::text AS id,
                p.id::text AS "idPersona",
                p.numero_identificacion AS identificacion,
                BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
                BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
                COALESCE(m.codigo_externo, e.codigo_externo, pv.codigo) AS codigo,
                ta.nombre AS "tipoApoyo",
                COALESCE(cat.actividad, a.actividad) AS apoyo,
                pa.nombre AS periodo,
                ARRAY(SELECT DISTINCT other_pv.tipo_participante
                      FROM sat.participantes_vec other_pv
                      WHERE other_pv.id_personas = p.id
                      ORDER BY other_pv.tipo_participante) AS roles,
                1::int AS registros,
                'Actividad'::text AS fuente,
                CASE
                  WHEN avp.id_tipos_apoyo IS NOT NULL THEN 'Seleccionado al registrar la actividad'
                  WHEN ruta.id_tipos_apoyo IS NOT NULL THEN 'Sugerido por coincidencia con una ruta institucional'
                  ELSE 'Sin clasificar'
                END AS "origenClasificacion"
         FROM sat.actividades_vec_participantes avp
         JOIN sat.participantes_vec pv ON pv.id_participantes_vec = avp.id_participantes_vec
         JOIN sat.personas p ON p.id = pv.id_personas
         JOIN sat.actividades_vec a ON a.id_actividades_vec = avp.id_actividades_vec
         JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = a.id_periodos_academicos
         LEFT JOIN sat.catalogo_actividades_vec cat
           ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
          AND cat.tipo_registro = 'ACTIVIDAD'
         LEFT JOIN LATERAL (
           SELECT r.id_tipos_apoyo
           FROM sat.rutas_remision r
           LEFT JOIN sat.programas_bienestar rp ON rp.id_programas_bienestar = r.id_programas_bienestar
           WHERE r.activo = true AND (
             LOWER(BTRIM(r.nombre)) = LOWER(BTRIM(COALESCE(cat.proyecto, a.proyecto, '')))
             OR LOWER(BTRIM(r.nombre)) = LOWER(BTRIM(COALESCE(cat.actividad, a.actividad, '')))
             OR LOWER(BTRIM(rp.nombre)) = LOWER(BTRIM(COALESCE(cat.programa, '')))
           )
           ORDER BY CASE WHEN LOWER(BTRIM(r.nombre)) IN (
             LOWER(BTRIM(COALESCE(cat.proyecto, a.proyecto, ''))),
             LOWER(BTRIM(COALESCE(cat.actividad, a.actividad, '')))
           ) THEN 0 ELSE 1 END, r.id_rutas_remision
           LIMIT 1
         ) ruta ON TRUE
         LEFT JOIN sat.apoyos_actividades_vec ta ON ta.id_tipos_apoyo = COALESCE(avp.id_tipos_apoyo, ruta.id_tipos_apoyo)
         LEFT JOIN LATERAL (
           SELECT est.id_estudiantes, est.codigo_externo
           FROM sat.estudiantes est
           WHERE est.id_personas = p.id
           ORDER BY est.id_estudiantes
           LIMIT 1
         ) e ON TRUE
         LEFT JOIN LATERAL (
           SELECT ma.codigo_externo
           FROM sat.matriculas ma
           WHERE ma.id_estudiantes = e.id_estudiantes
           ORDER BY (UPPER(COALESCE(ma.estado, '')) = 'ACTIVA') DESC, ma.id_matriculas DESC
           LIMIT 1
         ) m ON TRUE
         WHERE ($1::uuid IS NULL OR COALESCE(avp.id_tipos_apoyo, ruta.id_tipos_apoyo) = $1)
         ORDER BY apellidos, nombres, identificacion, apoyo`,
        [idTipoApoyo]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM sat.actividades_vec_participantes avp
         WHERE avp.id_tipos_apoyo IS NULL`
      ),
    ]);

    const rutas = idTipoApoyo
      ? await query(
        `SELECT r.id_rutas_remision AS id,
                r.nombre,
                p.nombre AS programa,
                d.nombre AS dependencia,
                r.profesional_responsable AS responsable,
                r.observaciones AS observaciones
         FROM sat.rutas_remision r
         LEFT JOIN sat.programas_bienestar p ON p.id_programas_bienestar = r.id_programas_bienestar
         LEFT JOIN sat.dependencias d ON d.id_dependencias = r.id_dependencias
         WHERE r.id_tipos_apoyo = $1 AND r.activo = true
         ORDER BY r.nombre, p.nombre`,
        [idTipoApoyo]
      )
      : { rows: [] };

    const personas = new Map();
    const agregarRegistro = (registro) => {
      const documento = String(registro.identificacion || "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
      const key = documento ? `documento:${documento}` : `persona:${registro.idPersona || registro.id}`;
      let persona = personas.get(key);
      if (!persona) {
        persona = {
          id: key,
          identificacion: registro.identificacion,
          nombres: registro.nombres,
          apellidos: registro.apellidos,
          codigo: registro.codigo,
          tiposApoyo: new Set(),
          roles: new Set(),
          apoyos: new Set(),
          periodos: new Set(),
          fuentes: new Set(),
          clasificaciones: new Set(),
          porcentajes: new Set(),
          valores: new Set(),
          registros: 0,
        };
        personas.set(key, persona);
      }
      if (!persona.identificacion) persona.identificacion = registro.identificacion;
      if (!persona.nombres) persona.nombres = registro.nombres;
      if (!persona.apellidos) persona.apellidos = registro.apellidos;
      if (!persona.codigo) persona.codigo = registro.codigo;
      persona.tiposApoyo.add(registro.tipoApoyo || "Sin clasificar");
      (registro.roles || []).filter(Boolean).forEach((rol) => persona.roles.add(rol));
      [registro.apoyos, registro.apoyo].filter(Boolean).forEach((value) => {
        String(value).split(" | ").filter(Boolean).forEach((apoyo) => persona.apoyos.add(apoyo));
      });
      [registro.periodos, registro.porcentajes, registro.valores].forEach((value, index) => {
        if (!value) return;
        String(value).split(" | ").filter(Boolean).forEach((item) => {
          [persona.periodos, persona.porcentajes, persona.valores][index].add(item);
        });
      });
      if (registro.fuente) persona.fuentes.add(registro.fuente);
      if (registro.origenClasificacion) persona.clasificaciones.add(registro.origenClasificacion);
      persona.registros += Number(registro.registros) || 1;
    };
    financieros.rows.forEach(agregarRegistro);
    actividades.rows.forEach(agregarRegistro);

    const todos = [...personas.values()]
      .map((persona) => Object.fromEntries(Object.entries(persona).map(([key, value]) => (
        [key, value instanceof Set ? [...value].sort((a, b) => a.localeCompare(b, "es")) : value]
      ))))
      .sort((a, b) => `${a.apellidos || ""} ${a.nombres || ""}`.localeCompare(`${b.apellidos || ""} ${b.nombres || ""}`, "es"));

    res.json({
      beneficiarios: todos.slice((pagina - 1) * limite, pagina * limite),
      total: todos.length,
      sinTipoApoyo: sinTipoApoyo.rows[0].total,
      rutas: rutas.rows,
      pagina,
      limite,
    });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/apoyos", async (req, res, next) => {
  const idTipoApoyo = String(req.query.tipoApoyo || "").trim();
  if (!UUID_PATTERN.test(idTipoApoyo)) {
    return res.status(400).json({ error: "Selecciona un tipo de apoyo válido." });
  }

  const requestedPage = Number.parseInt(req.query.pagina, 10);
  const pagina = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const limite = 50;
  const offset = (pagina - 1) * limite;

  try {
    const tipoResult = await query(
      `SELECT numero FROM sat.apoyos_actividades_vec WHERE id_tipos_apoyo = $1 AND activo = true`,
      [idTipoApoyo]
    );
    if (!tipoResult.rows[0]) {
      return res.status(404).json({ error: "El tipo de apoyo seleccionado no está activo." });
    }

    const [beneficiarios, total, sinTipoApoyo, beneficiosEconomicos, rutas] = await Promise.all([
      query(
        `SELECT avp.id_actividades_vec_participantes AS id,
                p.numero_identificacion AS identificacion,
                BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido,
                                 p.primer_nombre, p.segundo_nombre)) AS "apellidosNombres",
                pv.tipo_participante AS "rolParticipacion",
                COALESCE(roles.roles, ARRAY[pv.tipo_participante]) AS roles,
                COALESCE(cat.actividad, a.actividad) AS actividad,
                COALESCE(cat.proyecto, a.proyecto) AS proyecto,
                COALESCE(cat.programa, pb.nombre) AS "programaBienestar",
                pa.nombre AS periodo,
                a.fecha_inicio AS "fechaInicio",
                a.fecha_finalizacion AS "fechaFinalizacion"
         FROM sat.actividades_vec_participantes avp
         JOIN sat.apoyos_actividades_vec ta ON ta.id_tipos_apoyo = avp.id_tipos_apoyo
         JOIN sat.participantes_vec pv ON pv.id_participantes_vec = avp.id_participantes_vec
         JOIN sat.personas p ON p.id = pv.id_personas
         JOIN sat.actividades_vec a ON a.id_actividades_vec = avp.id_actividades_vec
         JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos = a.id_periodos_academicos
         LEFT JOIN sat.catalogo_actividades_vec cat
           ON cat.id_catalogo_actividades_vec = a.id_catalogo_actividades_vec
          AND cat.tipo_registro = 'ACTIVIDAD'
         LEFT JOIN sat.programas_bienestar pb
           ON pb.id_programas_bienestar = a.id_programas_bienestar
         LEFT JOIN LATERAL (
           SELECT ARRAY_AGG(DISTINCT other_pv.tipo_participante ORDER BY other_pv.tipo_participante) AS roles
           FROM sat.participantes_vec other_pv
           WHERE other_pv.id_personas = p.id
         ) roles ON TRUE
         WHERE avp.id_tipos_apoyo = $1
         ORDER BY a.fecha_inicio DESC, a.fecha_finalizacion DESC,
                  "apellidosNombres", p.numero_identificacion
         LIMIT $2 OFFSET $3`,
        [idTipoApoyo, limite, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM sat.actividades_vec_participantes
         WHERE id_tipos_apoyo = $1`,
        [idTipoApoyo]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM sat.actividades_vec_participantes
         WHERE id_tipos_apoyo IS NULL`
      ),
      // La tabla financiera no tiene FK a tipos_apoyo; estos registros corresponden
      // a la categoría institucional de beneficios económicos.
      tipoResult.rows[0].numero === NUMERO_TIPO_BENEFICIOS_ECONOMICOS
        ? query(
          `SELECT e.id_estudiantes AS id,
                  COALESCE(per.numero_identificacion, e.numero_documento) AS identificacion,
                  BTRIM(COALESCE(
                    NULLIF(BTRIM(CONCAT_WS(' ', per.primer_apellido, per.segundo_apellido)), ''),
                    e.apellidos
                  )) AS apellidos,
                  BTRIM(COALESCE(
                    NULLIF(BTRIM(CONCAT_WS(' ', per.primer_nombre, per.segundo_nombre)), ''),
                    e.nombres
                  )) AS nombres,
                  e.codigo_externo AS codigo,
                  COUNT(*)::int AS registros,
                  STRING_AGG(DISTINCT COALESCE(
                    NULLIF(BTRIM(af.nombre_descuento), ''),
                    NULLIF(BTRIM(af.concepto_descuento), ''),
                    'Apoyo sin clasificar'
                  ), ' · ' ORDER BY COALESCE(
                    NULLIF(BTRIM(af.nombre_descuento), ''),
                    NULLIF(BTRIM(af.concepto_descuento), ''),
                    'Apoyo sin clasificar'
                  )) AS apoyos,
                  STRING_AGG(DISTINCT pa.nombre, ' · ' ORDER BY pa.nombre)
                    FILTER (WHERE pa.nombre IS NOT NULL) AS periodos,
                  STRING_AGG(DISTINCT NULLIF(af.porcentaje_descuento::text, ''), ' · '
                    ORDER BY NULLIF(af.porcentaje_descuento::text, ''))
                    FILTER (WHERE af.porcentaje_descuento IS NOT NULL) AS porcentajes,
                  STRING_AGG(DISTINCT NULLIF(af.valor_descuento::text, ''), ' · '
                    ORDER BY NULLIF(af.valor_descuento::text, ''))
                    FILTER (WHERE af.valor_descuento IS NOT NULL) AS valores
           FROM sat.apoyos_financieros af
           JOIN sat.estudiantes e ON e.id_estudiantes = af.id_estudiantes
           LEFT JOIN sat.personas per ON per.id = e.id_personas
           LEFT JOIN sat.periodos_academicos pa
             ON pa.id_periodos_academicos = af.id_periodos_academicos
           GROUP BY e.id_estudiantes, per.numero_identificacion, e.numero_documento,
                    per.primer_apellido, per.segundo_apellido, e.apellidos,
                    per.primer_nombre, per.segundo_nombre, e.nombres, e.codigo_externo
           ORDER BY apellidos, nombres, identificacion`
        )
        : Promise.resolve({ rows: [] }),
      query(
        `SELECT r.id_rutas_remision AS id,
                r.nombre,
                p.nombre AS programa,
                d.nombre AS dependencia,
                r.profesional_responsable AS responsable,
                r.observaciones AS observaciones
         FROM sat.rutas_remision r
         LEFT JOIN sat.programas_bienestar p
           ON p.id_programas_bienestar = r.id_programas_bienestar
         LEFT JOIN sat.dependencias d
           ON d.id_dependencias = r.id_dependencias
         WHERE r.id_tipos_apoyo = $1 AND r.activo = true
         ORDER BY r.nombre, p.nombre`,
        [idTipoApoyo]
      ),
    ]);

    res.json({
      beneficiarios: beneficiarios.rows,
      beneficiosEconomicos: beneficiosEconomicos.rows,
      rutas: rutas.rows,
      total: total.rows[0].total,
      sinTipoApoyo: sinTipoApoyo.rows[0].total,
      pagina,
      limite,
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
      `SELECT COUNT(DISTINCT pv.id_personas)::int AS total_participantes,
              COUNT(DISTINCT pv.id_personas)
                FILTER (WHERE pv.tipo_participante = 'ESTUDIANTE')::int AS estudiantes,
              COUNT(DISTINCT pv.id_personas)
                FILTER (WHERE pv.tipo_participante = 'COLABORADOR')::int AS colaboradores,
              COUNT(DISTINCT pv.id_personas)
                FILTER (WHERE pv.tipo_participante = 'EGRESADO')::int AS egresados,
              COUNT(DISTINCT pv.id_personas)
                FILTER (WHERE pv.tipo_participante = 'EXTERNO')::int AS externos,
              (SELECT COUNT(*)::int FROM sat.actividades_vec) AS total_actividades
       FROM sat.actividades_vec_participantes avp
       JOIN sat.actividades_vec a
         ON a.id_actividades_vec = avp.id_actividades_vec
       JOIN sat.participantes_vec pv
         ON pv.id_participantes_vec = avp.id_participantes_vec`
    );
    res.json(rows[0]);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/personas/buscar", async (req, res, next) => {
  const term = String(req.query.termino || "").trim();
  if (term.length < 2 || term.length > 100) return res.status(400).json({ error: "Escribe al menos dos caracteres para buscar." });
  try {
    const { rows } = await query(
      `SELECT p.id AS "idPersona", p.numero_identificacion AS identificacion,
              BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
              BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
              COALESCE(e.codigo_externo, pv.codigo, d.codigo_externo) AS codigo,
              COALESCE(roles.roles, ARRAY[]::varchar[]) AS roles
       FROM sat.personas p
       LEFT JOIN LATERAL (
         SELECT e.codigo_externo FROM sat.estudiantes e
         WHERE e.id_personas=p.id OR e.numero_documento=p.numero_identificacion
         ORDER BY (e.id_personas=p.id) DESC NULLS LAST LIMIT 1
       ) e ON true
       LEFT JOIN LATERAL (
         SELECT d.codigo_externo FROM sat.docentes d
         WHERE d.id_personas=p.id OR d.numero_documento=p.numero_identificacion
         ORDER BY d.activo DESC LIMIT 1
       ) d ON true
       LEFT JOIN LATERAL (
         SELECT pv.codigo FROM sat.participantes_vec pv WHERE pv.id_personas=p.id ORDER BY pv.creado_en DESC LIMIT 1
       ) pv ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(DISTINCT perfil.tipo_participante ORDER BY perfil.tipo_participante) AS roles
         FROM (
           SELECT tipo_participante FROM sat.participantes_vec WHERE id_personas=p.id
           UNION SELECT 'ESTUDIANTE' WHERE EXISTS (SELECT 1 FROM sat.estudiantes st WHERE st.id_personas=p.id OR st.numero_documento=p.numero_identificacion)
           UNION SELECT 'COLABORADOR' WHERE EXISTS (
             SELECT 1 FROM sat.usuarios u LEFT JOIN sat.usuarios_roles ur ON ur.id_usuarios=u.id_usuarios
             LEFT JOIN sat.roles r ON r.id_roles=ur.id_roles
             WHERE (u.id_personas=p.id OR u.numero_documento=p.numero_identificacion)
               AND u.activo=true AND u.eliminado_en IS NULL
               AND (UPPER(BTRIM(COALESCE(r.nombre,''))) IN ('ADMIN','ADMINISTRADOR','COLABORADOR','DIRECTIVO','DOCENTE','PROFESIONAL')
                    OR EXISTS (SELECT 1 FROM sat.docentes dt WHERE dt.id_usuarios=u.id_usuarios AND dt.activo=true))
           )
           UNION SELECT 'COLABORADOR' WHERE EXISTS (
             SELECT 1 FROM sat.docentes dt WHERE (dt.id_personas=p.id OR dt.numero_documento=p.numero_identificacion) AND dt.activo=true
           )
         ) perfil
       ) roles ON true
       WHERE p.numero_identificacion ILIKE '%' || $1 || '%'
          OR BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido)) ILIKE '%' || $1 || '%'
          OR COALESCE(e.codigo_externo, pv.codigo, d.codigo_externo, '') ILIKE '%' || $1 || '%'
       ORDER BY p.primer_apellido, p.primer_nombre
       LIMIT 50`,
      [term]
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.get("/historial/:identificacion", async (req, res, next) => {
  const identification = String(req.params.identificacion || "").trim();
  if (!identification || identification.length > MAX_IDENTIFICACION_LENGTH) return res.status(400).json({ error: "Documento inválido." });
  try {
    const { rows } = await query(
      `SELECT a.id_actividades_vec AS "idActividad",
              COALESCE(cat.actividad, a.actividad) AS actividad,
              COALESCE(cat.proyecto, a.proyecto) AS proyecto,
              pa.nombre AS periodo, a.fecha_inicio AS "fechaInicio",
              a.fecha_finalizacion AS "fechaFinalizacion", a.estado,
              pv.tipo_participante AS rol,
              ta.nombre AS "tipoApoyo", avp.creado_en AS "fechaRegistro",
              COALESCE((to_jsonb(avp)->>'asistencia_verificada')::boolean, false) AS "asistenciaVerificada"
       FROM sat.personas p
       JOIN sat.participantes_vec pv ON pv.id_personas=p.id
       JOIN sat.actividades_vec_participantes avp ON avp.id_participantes_vec=pv.id_participantes_vec
       JOIN sat.actividades_vec a ON a.id_actividades_vec=avp.id_actividades_vec
       JOIN sat.periodos_academicos pa ON pa.id_periodos_academicos=a.id_periodos_academicos
       LEFT JOIN sat.catalogo_actividades_vec cat ON cat.id_catalogo_actividades_vec=a.id_catalogo_actividades_vec
       LEFT JOIN sat.apoyos_actividades_vec ta ON ta.id_tipos_apoyo=avp.id_tipos_apoyo
       WHERE p.numero_identificacion=$1
       ORDER BY a.fecha_inicio DESC, avp.creado_en DESC`,
      [identification]
    );
    res.json(rows);
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
              pv.id_personas AS "idPersona",
              pv.tipo_participante AS tipo,
              ARRAY(
                SELECT roles.rol
                FROM (
                  SELECT DISTINCT rol.tipo_participante AS rol
                  FROM sat.participantes_vec rol
                  WHERE rol.id_personas = pv.id_personas
                  UNION
                  SELECT 'ESTUDIANTE'
                  WHERE EXISTS (
                    SELECT 1 FROM sat.estudiantes e
                    WHERE e.id_personas = pv.id_personas OR e.numero_documento = p.numero_identificacion
                  )
                ) roles
                ORDER BY roles.rol
              ) AS roles,
              EXISTS (
                SELECT 1 FROM sat.estudiantes e
                WHERE e.id_personas = pv.id_personas OR e.numero_documento = p.numero_identificacion
              ) OR EXISTS (
                SELECT 1 FROM sat.participantes_vec student_profile
                WHERE student_profile.id_personas = pv.id_personas
                  AND student_profile.tipo_participante = 'ESTUDIANTE'
              ) AS "tieneRolEstudiante",
              (SELECT COUNT(*)::int
               FROM sat.actividades_vec_participantes avp
               WHERE avp.id_participantes_vec = pv.id_participantes_vec) AS "totalInscripciones",
              (SELECT COUNT(*)::int
               FROM sat.actividades_vec_participantes avp
               JOIN sat.participantes_vec all_profiles
                 ON all_profiles.id_participantes_vec = avp.id_participantes_vec
               WHERE all_profiles.id_personas = p.id) AS "totalInscripcionesPersona",
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
    let participante = null;
    const tiposBusqueda = [
      tipo,
      ...["ESTUDIANTE", "COLABORADOR"].filter((rol) => rol !== tipo),
    ];
    for (const tipoBusqueda of tiposBusqueda) {
      participante = await buscarParticipante(tipoBusqueda, identificacion);
      if (participante) break;
    }
    if (!participante) {
      participante = await buscarParticipanteEnPersonas(tipo, identificacion);
    }
    if (participante) {
      participante.tipo = tipo;
      const datosComplementarios = await buscarDatosComplementariosPersona(participante.idPersona);
      for (const [campo, valor] of Object.entries(datosComplementarios)) {
        if (participante[campo] == null || participante[campo] === "") {
          participante[campo] = valor;
        }
      }
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
             JOIN sat.usuarios_roles ur ON ur.id_usuarios = u.id_usuarios
             JOIN sat.roles rol ON rol.id_roles = ur.id_roles
             WHERE u.activo = true AND u.eliminado_en IS NULL
               AND UPPER(BTRIM(rol.nombre)) IN (
                 'ADMIN', 'ADMINISTRADOR', 'COLABORADOR', 'DIRECTIVO', 'DOCENTE', 'PROFESIONAL'
               )
               AND (($1::bigint IS NOT NULL AND u.id_personas = $1::bigint)
                 OR ($2::text IS NOT NULL AND u.numero_documento = $2))
           )
           UNION
           SELECT 'COLABORADOR'
           WHERE EXISTS (
             SELECT 1 FROM sat.docentes d
             WHERE d.activo = true
               AND (($1::bigint IS NOT NULL AND d.id_personas = $1::bigint)
                 OR ($2::text IS NOT NULL AND d.numero_documento = $2))
           )
         ) roles
         ORDER BY roles.rol`,
        [participante.idPersona, identificacion]
      );
      participante.roles = rows.map((row) => row.rol);
      participante.rolesVerificados = await obtenerRolesVerificados(
        query,
        participante.idPersona,
        identificacion,
      );
      return res.json({ encontrado: true, participante });
    }

    return res.json({ encontrado: false, tipo, identificacion });
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

function normalizarNombreImportacion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es");
}

function tokensNombreImportacion(value) {
  return normalizarNombreImportacion(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function coincideNombreImportacion(proporcionado, institucional) {
  const tokensProporcionados = tokensNombreImportacion(proporcionado);
  const tokensInstitucionales = tokensNombreImportacion(institucional);
  return tokensProporcionados.length > 0
    && tokensProporcionados.every((token) => tokensInstitucionales.includes(token));
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }));
  return results;
}

async function validarCargaMasiva(idActividad, filas) {
  const { rows: eventos } = await query(
    `SELECT id_actividades_vec AS id, estado,
            fecha_finalizacion::date::text AS "fechaFinalizacion",
            variables_modalidades AS "variablesModalidades"
     FROM sat.actividades_vec
     WHERE id_actividades_vec = $1`,
    [idActividad]
  );
  const actividad = eventos[0];
  if (!actividad || actividad.estado === "CANCELADA") {
    throw Object.assign(new Error("La actividad ya no está disponible para recibir participantes."), { status: 409 });
  }

  const normalizadas = filas.map((fila, index) => {
    const participante = normalizarEntrada({
      ...fila,
      tipoDocumento: fila.tipoDocumento || "CC",
    });
    return {
      fila: Number(fila.fila) || index + 2,
      participante,
      nombreCompleto: String(fila.nombreCompleto || "").trim(),
      identificadores: [...new Set([
        participante.identificacion,
        fila.codigoInstitucional,
        fila.codigo,
        fila.identificador,
      ].map((value) => String(value || "").trim()).filter(Boolean))],
      variable: String(fila.modalidadVariable || fila.subdivisionPrograma || "").trim(),
      idTipoApoyo: null,
    };
  });
  const variables = actividad.variablesModalidades || [];
  const { rows: apoyoVariables } = variables.length
    ? await query(
      `SELECT programa AS "programaCompleto", id_tipos_apoyo AS id
       FROM sat.actividades_vec_modalidades
       WHERE id_actividades_vec = $1`,
      [idActividad]
    )
    : { rows: [] };
  const apoyosPorVariable = new Map(apoyoVariables.map((row) => [row.programaCompleto, row.id]));

  const results = await mapConcurrent(normalizadas, 5, async (row) => {
    const { participante } = row;
    if (!row.identificadores.length) {
      return { ...row, status: "invalid", message: "La fila no contiene documento ni código institucional." };
    }
    if (row.identificadores.some((identificador) => identificador.length > 64)) {
      return { ...row, status: "invalid", message: "El documento o código supera el máximo de 64 caracteres." };
    }
    if (variables.length && !row.variable && variables.length === 1) {
      [row.variable] = variables;
    }
    if (variables.length && !row.variable) {
      return {
        ...row,
        status: "invalid",
        message: "Selecciona la variable o modalidad a la que se inscribirá esta persona.",
      };
    }
    if (row.variable) {
      if (!variables.includes(row.variable)) {
        return { ...row, status: "invalid", message: "La modalidad no corresponde a esta actividad." };
      }
      const idTipoApoyo = apoyosPorVariable.get(row.variable) || null;
      if (!idTipoApoyo) {
        return { ...row, status: "invalid", message: "La modalidad no tiene un apoyo activo asociado." };
      }
      row.idTipoApoyo = idTipoApoyo;
    }

    const identidades = [];
    for (const identificador of row.identificadores) {
      const coincidencias = await buscarIdentidadPorIdentificador(identificador);
      if (coincidencias.length > 1) {
        return {
          ...row,
          status: "invalid",
          message: `El identificador ${identificador} coincide con más de una persona; verifica el documento o código.`,
        };
      }
      if (coincidencias[0]) identidades.push({ identificador, ...coincidencias[0] });
    }
    if (identidades.length && identidades.length !== row.identificadores.length) {
      return {
        ...row,
        status: "invalid",
        message: "El documento y el código institucional no corresponden a la misma persona o uno de ellos no está registrado.",
      };
    }
    if (!identidades.length) {
      return {
        ...row,
        status: "not_found",
        message: `No se encontró una persona con el identificador ${row.identificadores[0]}.`,
      };
    }
    const personasCoincidentes = new Set(identidades.map((identity) => identity.idPersona || identity.identificacion));
    if (personasCoincidentes.size > 1) {
      return { ...row, status: "invalid", message: "El documento y el código institucional no corresponden a la misma persona." };
    }
    const identidad = identidades[0];
    const identificacionCanonica = identidad.identificacion || participante.identificacion;
    const rolesExistentes = await obtenerRolesParticipante(
      query,
      identidad.idPersona,
      identificacionCanonica,
    );
    const roles = rolesExistentes.filter((role) => ROLES_PARTICIPANTE_VEC.has(role));
    if (!roles.length) {
      return {
        ...row,
        status: "not_found",
        participante: { ...participante, identificacion: identificacionCanonica },
        message: "La persona existe, pero no tiene un rol de participante registrado. Puedes crearla como egresado, colaborador o externo.",
      };
    }
    if (roles.includes("EXTERNO") && roles.length > 1) {
      return { ...row, status: "invalid", message: "El rol Externo es exclusivo y no se puede combinar con otros roles." };
    }
    const encontrados = await Promise.all(roles.map(async (tipo) => (
      await buscarParticipante(tipo, identificacionCanonica)
      || await buscarParticipanteEnPersonas(tipo, identificacionCanonica)
    )));
    const perfiles = encontrados.filter(Boolean);
    const encontrado = perfiles[0] || {
      ...participante,
      identificacion: identificacionCanonica,
      idPersona: identidad.idPersona,
    };
    const nombresInstitucionales = perfiles.find((profile) => profile.nombres && profile.apellidos) || encontrado;
    if (!encontrado.identificacion || !encontrado.nombres || !encontrado.apellidos) {
      return { ...row, participante: encontrado, status: "invalid", message: "El registro institucional no contiene cédula o nombre completo para verificar la inscripción." };
    }
    const nombresArchivoCoinciden = (!participante.nombres
      || coincideNombreImportacion(
        participante.nombres,
        participante.apellidos ? nombresInstitucionales.nombres : `${nombresInstitucionales.nombres} ${nombresInstitucionales.apellidos}`,
      ))
      && (!participante.apellidos || coincideNombreImportacion(participante.apellidos, nombresInstitucionales.apellidos));
    if (!nombresArchivoCoinciden) {
      return { ...row, status: "invalid", message: "El nombre del archivo no coincide con los datos institucionales." };
    }
    if (row.nombreCompleto
      && !coincideNombreImportacion(
        row.nombreCompleto,
        `${nombresInstitucionales.nombres} ${nombresInstitucionales.apellidos}`,
      )) {
      return { ...row, status: "invalid", message: "El nombre completo del archivo no coincide con los datos institucionales." };
    }
    const participanteCanonico = {
      ...participante,
      ...encontrado,
      tipo: roles[0],
      roles,
      idPersona: identidad.idPersona || encontrado.idPersona,
      identificacion: identificacionCanonica,
      tipoDocumento: encontrado.tipoDocumento || participante.tipoDocumento || "CC",
      detalleTipoParticipante: encontrado.detalleTipoParticipante || ({
        ESTUDIANTE: "Estudiante",
        EGRESADO: "Egresado no titulado",
        COLABORADOR: "Colaborador",
        EXTERNO: "Externo",
      }[roles[0]]),
      semestre: encontrado.semestre == null || encontrado.semestre === ""
        ? null
        : Number(encontrado.semestre),
      fechaNacimiento: encontrado.fechaNacimiento || participante.fechaNacimiento || null,
      fechaEgreso: encontrado.fechaEgreso || participante.fechaEgreso || null,
      correo: encontrado.correo || participante.correo || null,
      correoInstitucional: encontrado.correoInstitucional || participante.correoInstitucional || null,
      celular: encontrado.celular || encontrado.contacto || participante.celular || null,
      telefono: encontrado.telefono || participante.telefono || null,
      direccion: encontrado.direccion || participante.direccion || null,
      genero: encontrado.genero || participante.genero || null,
      lugarNacimiento: encontrado.lugarNacimiento || participante.lugarNacimiento || null,
      municipio: encontrado.municipio || participante.municipio || null,
    };
    return {
      ...row,
      participante: participanteCanonico,
      status: "valid",
      message: `Persona encontrada. Se registrará con sus roles existentes: ${roles.join(", ")}.`,
    };
  });

  const identificaciones = [...new Set(results
    .filter((row) => row.status === "valid")
    .map((row) => row.participante.identificacion))];
  const { rows: inscritos } = identificaciones.length
    ? await query(
      `SELECT p.numero_identificacion AS identificacion, pv.tipo_participante AS rol
       FROM sat.actividades_vec_participantes avp
       JOIN sat.participantes_vec pv
         ON pv.id_participantes_vec = avp.id_participantes_vec
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE avp.id_actividades_vec = $1
         AND p.numero_identificacion = ANY($2::text[])`,
      [idActividad, identificaciones]
    )
    : { rows: [] };
  const keysInscritos = new Set(inscritos.map((row) => (
    `${normalizarNombreImportacion(row.identificacion)}:${row.rol}`
  )));
  const personasIncluidas = new Set();
  return results.map((row) => {
    if (!["valid", "not_found"].includes(row.status)) return row;
    const keys = row.status === "valid"
      ? [
        String(row.participante.idPersona || ""),
        ...row.identificadores.map(normalizarNombreImportacion),
      ].filter(Boolean)
      : row.identificadores.map(normalizarNombreImportacion);
    if (row.status === "valid") {
      const rolesPendientes = row.participante.roles.filter((role) => (
        !keysInscritos.has(`${normalizarNombreImportacion(row.participante.identificacion)}:${role}`)
      ));
      if (!rolesPendientes.length) {
        return { ...row, status: "duplicate", message: "La persona ya está registrada en la actividad con todos sus roles; se omite." };
      }
      row.participante.rolesPendientes = rolesPendientes;
      if (rolesPendientes.length !== row.participante.roles.length) {
        row.message = `Se registrará con los roles pendientes: ${rolesPendientes.join(", ")}.`;
      }
    }
    if (keys.some((key) => personasIncluidas.has(key))) {
      return { ...row, status: "duplicate", message: "La persona aparece más de una vez en el archivo; se conserva una sola fila." };
    }
    keys.forEach((key) => personasIncluidas.add(key));
    return row;
  });
}

router.post("/registro-actividad/validar-masivo", async (req, res, next) => {
  const idActividad = String(req.body?.idActividad || "").trim();
  const filas = req.body?.participantes;
  if (!UUID_PATTERN.test(idActividad)) return res.status(400).json({ error: "Selecciona una actividad válida." });
  if (!Array.isArray(filas) || filas.length < 1 || filas.length > 500) {
    return res.status(400).json({ error: "La carga debe contener entre 1 y 500 participantes." });
  }
  try {
    const results = await validarCargaMasiva(idActividad, filas);
    res.json({
      valido: results.every((row) => row.status === "valid"),
      filas: results.map((row) => ({
        fila: row.fila,
        identificacion: row.participante.identificacion,
        tipo: row.participante.tipo,
        roles: row.participante.roles || [],
        nombres: row.participante.nombres,
        apellidos: row.participante.apellidos,
        modalidadVariable: row.variable,
        idTipoApoyo: row.idTipoApoyo || null,
        status: row.status,
        message: row.message,
      })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    enviarErrorBaseDatos(err, res, next);
  }
});

async function obtenerEstadoPerfilPersona(db, identificacion) {
  const { rows: people } = await db.query(
    `SELECT id FROM sat.personas WHERE numero_identificacion = $1 LIMIT 1`,
    [identificacion],
  );
  const idPersona = people[0]?.id || null;
  const { rows: sourceRows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM sat.estudiantes WHERE numero_documento = $1
       UNION ALL
       SELECT 1 FROM sat.usuarios
       WHERE numero_documento = $1 AND activo = true AND eliminado_en IS NULL
       UNION ALL
       SELECT 1 FROM sat.docentes WHERE numero_documento = $1 AND activo = true
     ) AS existe`,
    [identificacion],
  );
  const roles = new Set(await obtenerRolesVerificados(db, idPersona, identificacion));
  const vecRoles = new Set();
  if (idPersona) {
    const { rows: profileRows } = await db.query(
      `SELECT tipo_participante AS rol
       FROM sat.participantes_vec
       WHERE id_personas = $1`,
      [idPersona],
    );
    profileRows.forEach((row) => {
      vecRoles.add(row.rol);
      roles.add(row.rol);
    });
  }
  return {
    existe: Boolean(idPersona || sourceRows[0]?.existe || roles.size),
    idPersona,
    roles: [...roles].sort(),
    vecRoles: [...vecRoles].sort(),
  };
}

function validarDatosPerfilImportado(participante) {
  const required = [
    ["identificación", participante.identificacion],
    ["nombres", participante.nombres],
    ["apellidos", participante.apellidos],
    ["tipo de documento", participante.tipoDocumento],
    ["fecha de nacimiento", participante.fechaNacimiento],
    ["género", participante.genero],
    ["correo personal", participante.correo],
    ["teléfono móvil", participante.celular],
    ["dirección de residencia", participante.direccion],
    ["ciudad o municipio", participante.municipio],
  ];
  const missing = required.find(([, value]) => !value);
  if (missing) return `Falta el campo obligatorio: ${missing[0]}.`;
  if (!TIPOS_DOCUMENTO_PARTICIPANTE.has(participante.tipoDocumento)) {
    return "Selecciona un tipo de documento válido.";
  }
  if (!/^[\p{L}\p{N}._-]{1,64}$/u.test(participante.identificacion)) {
    return "El número de documento debe tener máximo 64 letras o números.";
  }
  const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,119}$/u;
  if (!namePattern.test(participante.nombres) || !namePattern.test(participante.apellidos)) {
    return "Nombres y apellidos deben tener entre 2 y 120 caracteres.";
  }
  if (!["Femenino", "Masculino", "No binario", "Otro", "Prefiero no responder"].includes(participante.genero)) {
    return "Selecciona una opción válida para el género.";
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(participante.correo) || participante.correo.length > 254) {
    return "Ingresa un correo personal válido.";
  }
  for (const [label, value] of [["teléfono móvil", participante.celular], ["teléfono alternativo", participante.telefono]]) {
    if (!value) continue;
    const digits = value.replace(/\D/g, "");
    if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
      return `Ingresa un ${label} válido de 7 a 15 dígitos.`;
    }
  }
  for (const [label, value, max] of [
    ["lugar de nacimiento", participante.lugarNacimiento, 250],
    ["dirección", participante.direccion, 250],
    ["municipio", participante.municipio, 150],
    ["cargo", participante.cargo, 250],
    ["dependencia", participante.dependencia, 250],
  ]) {
    if (value && value.length > max) return `El campo ${label} supera el máximo de ${max} caracteres.`;
  }
  const birthDate = new Date(`${participante.fechaNacimiento}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(participante.fechaNacimiento)
    || Number.isNaN(birthDate.getTime())
    || birthDate.toISOString().slice(0, 10) !== participante.fechaNacimiento
    || participante.fechaNacimiento > new Date().toISOString().slice(0, 10)) {
    return "La fecha de nacimiento debe ser una fecha real que no sea posterior a hoy.";
  }
  if (participante.fechaEgreso) {
    const graduationDate = new Date(`${participante.fechaEgreso}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(participante.fechaEgreso)
      || Number.isNaN(graduationDate.getTime())
      || graduationDate.toISOString().slice(0, 10) !== participante.fechaEgreso) {
      return "La fecha de egreso debe tener un formato válido.";
    }
  }
  return "";
}

function validarEdicionPerfilRol(participante, datosPersonalesProtegidos) {
  if (!datosPersonalesProtegidos) {
    const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,119}$/u;
    if (!namePattern.test(participante.nombres || "")
      || !namePattern.test(participante.apellidos || "")) {
      return "Nombres y apellidos deben tener entre 2 y 120 caracteres.";
    }
    if (participante.correo
      && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participante.correo)
        || participante.correo.length > 254)) {
      return "Ingresa un correo personal válido de máximo 254 caracteres.";
    }
    if (participante.genero
      && !["Femenino", "Masculino", "No binario", "Otro", "Prefiero no responder"].includes(participante.genero)) {
      return "Selecciona una opción válida para el género.";
    }
    if (participante.fechaNacimiento) {
      const fecha = new Date(`${participante.fechaNacimiento}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(participante.fechaNacimiento)
        || Number.isNaN(fecha.getTime())
        || fecha.toISOString().slice(0, 10) !== participante.fechaNacimiento
        || participante.fechaNacimiento > new Date().toISOString().slice(0, 10)) {
        return "La fecha de nacimiento debe ser real y no puede ser posterior a hoy.";
      }
    }
  }
  if (participante.tipoDocumento && !TIPOS_DOCUMENTO_PARTICIPANTE.has(participante.tipoDocumento)) {
    return "Selecciona un tipo de documento válido.";
  }
  if (participante.semestre !== null
    && (!Number.isInteger(participante.semestre) || participante.semestre < 1 || participante.semestre > 32767)) {
    return "El semestre debe ser un número entero entre 1 y 32767.";
  }
  for (const [label, value, maxLength] of [
    ["programa académico", participante.programaAcademico, 250],
    ["programa de posgrado", participante.programaPosgradoDependencia, 250],
    ["código institucional", participante.codigo, 100],
    ["jornada", participante.jornada, 100],
    ["dependencia", participante.dependencia, 250],
    ["cargo", participante.cargo, 250],
    ["lugar de nacimiento", participante.lugarNacimiento, 250],
    ["etnia", participante.etnia, 150],
    ["municipio", participante.municipio, 150],
  ]) {
    if (value && value.length > maxLength) {
      return `El campo ${label} no puede superar ${maxLength} caracteres.`;
    }
  }
  for (const [label, value] of [
    ["fecha de egreso", participante.fechaEgreso],
    ...(!datosPersonalesProtegidos ? [["fecha de nacimiento", participante.fechaNacimiento]] : []),
  ]) {
    if (!value) continue;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
      || Number.isNaN(date.getTime())
      || date.toISOString().slice(0, 10) !== value) {
      return `La ${label} debe ser una fecha real en formato AAAA-MM-DD.`;
    }
  }
  if (!datosPersonalesProtegidos) {
    for (const [label, value, maxLength] of [
      ["teléfono móvil", participante.celular, 32],
      ["teléfono alternativo", participante.telefono, 32],
      ["dirección", participante.direccion, 250],
    ]) {
      if (value && value.length > maxLength) {
        return `El campo ${label} no puede superar ${maxLength} caracteres.`;
      }
    }
    for (const [label, value] of [
      ["teléfono móvil", participante.celular],
      ["teléfono alternativo", participante.telefono],
    ]) {
      if (!value) continue;
      const digits = value.replace(/\D/g, "");
      if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
        return `Ingresa un ${label} válido de 7 a 15 dígitos.`;
      }
    }
  }
  return "";
}

async function importarPerfilesMasivo(req, res, next, registrar) {
  const rol = String(req.body?.rol || "").trim().toUpperCase();
  const filas = req.body?.participantes;
  const confirmadas = new Set((Array.isArray(req.body?.confirmarFilas) ? req.body.confirmarFilas : []).map(Number));
  if (!["EGRESADO", "COLABORADOR", "EXTERNO"].includes(rol)) {
    return res.status(400).json({ error: "Selecciona Egresado, Colaborador o Externo para esta carga." });
  }
  if (!Array.isArray(filas) || filas.length < 1 || filas.length > 500) {
    return res.status(400).json({ error: "La carga debe contener entre 1 y 500 perfiles." });
  }

  const seen = new Set();
  const normalizedRows = filas.map((row, index) => {
    const participante = normalizarEntrada({ ...row, tipo: rol });
    return {
      fila: Number(row.fila) || index + 2,
      participante: {
        ...participante,
        detalleTipoParticipante: DETALLE_ROL_PARTICIPANTE[rol],
      },
    };
  });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const results = [];
    for (const row of normalizedRows) {
      const { fila, participante } = row;
      const key = participante.identificacion || `ROW-${fila}`;
      if (seen.has(key)) {
        results.push({ fila, status: "duplicate-file", message: "La identificación se repite en este archivo." });
        continue;
      }
      seen.add(key);
      const validationError = validarDatosPerfilImportado(participante);
      if (validationError) {
        results.push({ fila, status: "invalid", message: validationError });
        continue;
      }

      const state = await obtenerEstadoPerfilPersona(client, participante.identificacion);
      if (state.vecRoles.includes(rol)) {
        results.push({ fila, status: "already-has-role", roles: state.roles, message: `La persona ya tiene el rol ${DETALLE_ROL_PARTICIPANTE[rol]}.` });
        continue;
      }
      const hasExternalConflict = (rol === "EXTERNO" && state.roles.length > 0)
        || (rol !== "EXTERNO" && state.roles.includes("EXTERNO"));
      if (hasExternalConflict) {
        results.push({ fila, status: "external-conflict", roles: state.roles, message: "El rol Externo es exclusivo y no se puede combinar con otros roles." });
        continue;
      }

      const requiresConfirmation = state.existe;
      if (!registrar) {
        results.push({
          fila,
          status: requiresConfirmation ? "requires-confirmation" : "ready",
          roles: state.roles,
          message: requiresConfirmation
            ? `La persona ya existe${state.roles.length ? ` con rol: ${state.roles.map((item) => DETALLE_ROL_PARTICIPANTE[item] || item).join(", ")}` : ""}. Confirma para agregar ${DETALLE_ROL_PARTICIPANTE[rol]}.`
            : `Lista para crear perfil de ${DETALLE_ROL_PARTICIPANTE[rol]}.`,
        });
        continue;
      }
      if (requiresConfirmation && !confirmadas.has(fila)) {
        results.push({ fila, status: "omitted", roles: state.roles, message: "Se omitió: no se confirmó el nuevo rol." });
        continue;
      }

      await client.query("SAVEPOINT importar_perfil_vec");
      try {
        const profile = await guardarPerfilDeActividad(client, participante);
        results.push({
          fila,
          status: "created",
          roles: [...new Set([...state.roles, rol])].sort(),
          idPerfil: profile.idParticipante,
          personaNueva: profile.personaNueva,
          message: `Perfil de ${DETALLE_ROL_PARTICIPANTE[rol]} creado en sus tablas correspondientes.`,
        });
        await client.query("RELEASE SAVEPOINT importar_perfil_vec");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT importar_perfil_vec");
        if (error.code === "23514" && /rol EXTERNO/i.test(error.message)) {
          results.push({ fila, status: "external-conflict", roles: state.roles, message: "No se puede combinar el rol Externo con otros roles." });
        } else {
          results.push({ fila, status: "failed", message: error.message || "No se pudo guardar el perfil." });
        }
        await client.query("RELEASE SAVEPOINT importar_perfil_vec");
      }
    }
    await client.query("COMMIT");
    res.json({ resultados: results });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    enviarErrorBaseDatos(error, res, next);
  } finally {
    client?.release();
  }
}

router.post("/perfiles/masivo/validar", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  await importarPerfilesMasivo(req, res, next, false);
});

router.post("/perfiles/masivo/registrar", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  await importarPerfilesMasivo(req, res, next, true);
});

router.get("/perfiles/roles", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const rol = String(req.query.rol || "").trim().toUpperCase();
  const busqueda = String(req.query.busqueda || "").trim();
  if (!["EGRESADO", "COLABORADOR", "EXTERNO"].includes(rol)) {
    return res.status(400).json({ error: "Selecciona Egresado, Colaborador o Externo." });
  }
  if (busqueda.length > 120) {
    return res.status(400).json({ error: "La búsqueda no puede superar 120 caracteres." });
  }

  try {
    const { rows } = await query(
      `SELECT pv.id_participantes_vec AS id,
              pv.tipo_participante AS rol,
              pv.tipo_documento AS "tipoDocumento",
              pv.codigo,
              pv.programa_academico AS "programaAcademico",
              pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
              pv.semestre,
              pv.jornada,
              pv.dependencia,
              pv.cargo,
              pv.fecha_egreso AS "fechaEgreso",
              pv.lugar_nacimiento AS "lugarNacimiento",
              pv.etnia,
              pv.municipio,
              pv.discapacidad,
              pv.conflicto_armado AS "conflictoArmado",
              p.id AS "idPersona",
              p.numero_identificacion AS identificacion,
              BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
              BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
              p.genero,
              p.fecha_nacimiento AS "fechaNacimiento",
              COALESCE(p.correo_electronico, p.correo_electronico_opcional) AS correo,
              p.correo_institucional AS "correoInstitucional",
              p.celular,
              p.telefono,
              p.direccion,
              ARRAY(
                SELECT roles.rol
                FROM (
                  SELECT DISTINCT otro.tipo_participante AS rol
                  FROM sat.participantes_vec otro
                  WHERE otro.id_personas = p.id
                  UNION
                  SELECT 'ESTUDIANTE'
                  WHERE EXISTS (
                    SELECT 1 FROM sat.estudiantes e
                    WHERE e.id_personas = p.id OR e.numero_documento = p.numero_identificacion
                  )
                ) roles
                ORDER BY roles.rol
              ) AS roles,
              EXISTS (
                SELECT 1
                FROM sat.estudiantes e
                WHERE e.id_personas = p.id
                   OR e.numero_documento = p.numero_identificacion
              ) OR EXISTS (
                SELECT 1 FROM sat.participantes_vec student_profile
                WHERE student_profile.id_personas = p.id
                  AND student_profile.tipo_participante = 'ESTUDIANTE'
              ) OR EXISTS (
                SELECT 1
                FROM sat.usuarios u
                WHERE (u.id_personas = p.id OR u.numero_documento = p.numero_identificacion)
                  AND u.activo = true
                  AND u.eliminado_en IS NULL
                  AND (
                    EXISTS (
                      SELECT 1
                      FROM sat.usuarios_roles ur
                      JOIN sat.roles r ON r.id_roles = ur.id_roles
                      WHERE ur.id_usuarios = u.id_usuarios
                        AND r.activo = true
                        AND UPPER(BTRIM(r.nombre)) IN (
                          'ADMIN', 'ADMINISTRADOR', 'COLABORADOR', 'DIRECTIVO', 'DOCENTE', 'PROFESIONAL'
                        )
                    )
                    OR EXISTS (
                      SELECT 1 FROM sat.docentes d
                      WHERE d.id_usuarios = u.id_usuarios AND d.activo = true
                    )
                  )
              ) OR EXISTS (
                SELECT 1
                FROM sat.docentes d
                WHERE d.activo = true
                  AND (d.id_personas = p.id OR d.numero_documento = p.numero_identificacion)
              ) AS "datosPersonalesProtegidos",
              EXISTS (
                SELECT 1 FROM sat.estudiantes e
                WHERE e.id_personas = p.id OR e.numero_documento = p.numero_identificacion
              ) OR EXISTS (
                SELECT 1 FROM sat.participantes_vec student_profile
                WHERE student_profile.id_personas = p.id
                  AND student_profile.tipo_participante = 'ESTUDIANTE'
              ) AS "tieneRolEstudiante",
              (SELECT COUNT(*)::int
               FROM sat.actividades_vec_participantes avp
               WHERE avp.id_participantes_vec = pv.id_participantes_vec) AS "totalInscripciones",
              (SELECT COUNT(*)::int
               FROM sat.actividades_vec_participantes avp
               JOIN sat.participantes_vec all_profiles
                 ON all_profiles.id_participantes_vec = avp.id_participantes_vec
               WHERE all_profiles.id_personas = p.id) AS "totalInscripcionesPersona"
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE pv.tipo_participante = $1
         AND ($2::text = ''
              OR p.numero_identificacion ILIKE '%' || $2 || '%'
              OR BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre,
                                 p.primer_apellido, p.segundo_apellido)) ILIKE '%' || $2 || '%'
              OR COALESCE(p.correo_electronico, p.correo_electronico_opcional, '') ILIKE '%' || $2 || '%')
       ORDER BY p.primer_apellido, p.primer_nombre, p.numero_identificacion
       LIMIT 500`,
      [rol, busqueda],
    );
    res.json(rows);
  } catch (err) {
    enviarErrorBaseDatos(err, res, next);
  }
});

router.post(
  "/perfiles/roles/:id/agregar",
  requireRole("admin", "coordinador", "administrador"),
  async (req, res, next) => {
    const id = String(req.params.id || "");
    const rol = String(req.body?.rol || "").trim().toUpperCase();
    if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de perfil inválido." });
    if (!["EGRESADO", "COLABORADOR", "EXTERNO"].includes(rol)) {
      return res.status(400).json({ error: "Selecciona Egresado, Colaborador o Externo." });
    }
    if (req.body?.confirmarRolAdicional !== true) {
      return res.status(400).json({ error: "Confirma explícitamente que deseas agregar este rol adicional." });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT pv.id_personas AS "idPersona",
                p.numero_identificacion AS identificacion,
                pv.tipo_documento AS "tipoDocumento",
                BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)) AS nombres,
                BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)) AS apellidos,
                p.genero,
                p.fecha_nacimiento::text AS "fechaNacimiento",
                COALESCE(p.correo_electronico, p.correo_electronico_opcional) AS correo,
                p.correo_institucional AS "correoInstitucional",
                p.celular,
                p.telefono,
                p.direccion,
                pv.municipio
         FROM sat.participantes_vec pv
         JOIN sat.personas p ON p.id = pv.id_personas
         WHERE pv.id_participantes_vec = $1
           AND pv.tipo_participante IN ('EGRESADO', 'COLABORADOR', 'EXTERNO')
         FOR UPDATE OF pv, p`,
        [id],
      );
      const source = rows[0];
      if (!source) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró el perfil de referencia." });
      }
      if (!source.identificacion) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "No se puede asignar otro rol porque el perfil no tiene documento de identidad." });
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [source.identificacion],
      );
      const rolesInstitucionales = await obtenerRolesVerificados(client, source.idPersona, source.identificacion);
      const { rows: vecRoles } = await client.query(
        `SELECT DISTINCT tipo_participante AS rol
         FROM sat.participantes_vec
         WHERE id_personas = $1`,
        [source.idPersona],
      );
      const roles = [...new Set([
        ...rolesInstitucionales,
        ...vecRoles.map((row) => row.rol),
      ])];
      const { rows: targetProfiles } = await client.query(
        `SELECT 1
         FROM sat.participantes_vec
         WHERE id_personas = $1 AND tipo_participante = $2
         LIMIT 1`,
        [source.idPersona, rol],
      );
      if (targetProfiles.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `La persona ya tiene el perfil ${DETALLE_ROL_PARTICIPANTE[rol]}.` });
      }
      if (roles.includes("EXTERNO") || (rol === "EXTERNO" && roles.length > 0)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "El rol Externo es exclusivo y no se puede combinar con otros roles." });
      }

      const perfil = await guardarPerfilDeActividad(client, {
        ...source,
        tipo: rol,
        detalleTipoParticipante: DETALLE_ROL_PARTICIPANTE[rol],
      });
      await client.query("COMMIT");
      return res.json({
        agregado: true,
        idPerfil: perfil.idParticipante,
        roles: [...new Set([...roles, rol])].sort(),
        mensaje: `Se agregó el rol ${DETALLE_ROL_PARTICIPANTE[rol]}. Los roles anteriores se conservaron.`,
      });
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (err.code === "23514" && /rol EXTERNO/i.test(err.message)) {
        return res.status(409).json({ error: "El rol Externo es exclusivo y no se puede combinar con otros roles." });
      }
      if (err.code === "23502") {
        return res.status(400).json({ error: "No se pudo agregar el rol porque faltan datos obligatorios de la persona." });
      }
      if (err.status) return res.status(err.status).json({ error: err.message });
      return enviarErrorBaseDatos(err, res, next);
    } finally {
      client?.release();
    }
  },
);

router.put("/perfiles/roles/:id", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de perfil inválido." });

  const payload = normalizarEntrada(req.body);
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT pv.id_participantes_vec AS id, pv.tipo_participante AS rol,
              pv.id_personas AS "idPersona", p.numero_identificacion AS identificacion
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE pv.id_participantes_vec = $1
         AND pv.tipo_participante IN ('EGRESADO', 'COLABORADOR', 'EXTERNO')
       FOR UPDATE OF pv, p`,
      [id],
    );
    const perfil = rows[0];
    if (!perfil) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró el perfil de rol indicado." });
    }

    const rolesInstitucionales = await obtenerRolesVerificados(
      client,
      perfil.idPersona,
      perfil.identificacion,
    );
    const datosPersonalesProtegidos = rolesInstitucionales.some(
      (rol) => rol === "ESTUDIANTE" || rol === "COLABORADOR",
    );
    const invalidacion = validarEdicionPerfilRol(payload, datosPersonalesProtegidos);
    if (invalidacion) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: invalidacion });
    }

    await client.query(
      `UPDATE sat.participantes_vec SET
         tipo_documento = $2,
         programa_academico = $3,
         programa_posgrado_dependencia = $4,
         semestre = $5,
         jornada = $6,
         dependencia = $7,
         cargo = $8,
         fecha_egreso = $9,
         lugar_nacimiento = $10,
         etnia = $11,
         municipio = $12,
         discapacidad = $13,
         conflicto_armado = $14,
         codigo = $15,
         actualizado_en = now()
       WHERE id_participantes_vec = $1`,
      [
        id,
        payload.tipoDocumento,
        payload.programaAcademico,
        payload.programaPosgradoDependencia,
        payload.semestre,
        payload.jornada,
        payload.dependencia,
        payload.cargo,
        payload.fechaEgreso,
        payload.lugarNacimiento,
        payload.etnia,
        payload.municipio,
        payload.discapacidad,
        payload.conflictoArmado,
        payload.codigo,
      ],
    );

    if (!datosPersonalesProtegidos) {
      const nombres = dividirNombre(payload.nombres);
      const apellidos = dividirNombre(payload.apellidos);
      await client.query(
        `UPDATE sat.personas SET
           primer_nombre = $2,
           segundo_nombre = $3,
           primer_apellido = $4,
           segundo_apellido = $5,
           genero = $6,
           fecha_nacimiento = $7,
           correo_electronico = $8,
           celular = $9,
           telefono = $10,
           direccion = $11
         WHERE id = $1`,
        [
          perfil.idPersona,
          nombres.primero,
          nombres.segundo,
          apellidos.primero,
          apellidos.segundo,
          normalizarGeneroPersona(payload.genero),
          payload.fechaNacimiento,
          payload.correo,
          payload.celular,
          payload.telefono,
          payload.direccion,
        ],
      );
    }

    await client.query("COMMIT");
    return res.json({
      actualizado: true,
      datosPersonalesProtegidos,
      mensaje: datosPersonalesProtegidos
        ? "Se actualizó la ficha VEC. Los datos personales institucionales se conservaron sin cambios."
        : "Se actualizaron los datos personales y la ficha del rol.",
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23502") {
      return res.status(400).json({ error: "Falta un dato requerido para guardar el perfil." });
    }
    if (err.code === "22007" || err.code === "22P02" || err.code === "22001") {
      return res.status(400).json({ error: "Revisa las fechas, el semestre y la longitud de los campos." });
    }
    return enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.delete(
  "/perfiles/persona/:id/definitivo",
  requireRole("admin", "coordinador", "administrador"),
  async (req, res, next) => {
    const id = String(req.params.id || "");
    if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de perfil inválido." });

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT pv.id_participantes_vec AS id,
                pv.tipo_participante AS rol,
                pv.id_personas AS "idPersona",
                p.numero_identificacion AS identificacion,
                BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre,
                                p.primer_apellido, p.segundo_apellido)) AS nombre
         FROM sat.participantes_vec pv
         JOIN sat.personas p ON p.id = pv.id_personas
         WHERE pv.id_participantes_vec = $1
           AND pv.tipo_participante IN ('EGRESADO', 'COLABORADOR', 'EXTERNO')
         FOR UPDATE OF pv, p`,
        [id],
      );
      const persona = rows[0];
      if (!persona) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró una persona con un rol que pueda borrarse." });
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [persona.identificacion]);
      const { rows: estudianteRows } = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM sat.estudiantes
           WHERE id_personas = $1 OR numero_documento = $2 OR codigo_externo = $2
         ) OR EXISTS (
           SELECT 1 FROM sat.participantes_vec
           WHERE id_personas = $1 AND tipo_participante = 'ESTUDIANTE'
         ) AS tiene_rol_estudiante`,
        [persona.idPersona, persona.identificacion],
      );
      if (estudianteRows[0].tiene_rol_estudiante) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "STUDENT_ROLE_PROTECTED",
          error: "Esta persona también es estudiante. No se puede borrar definitivamente; quita únicamente el rol extra desde la lista de personas por rol.",
        });
      }
      const confirmationExpected = String(persona.identificacion || persona.nombre || "");
      if (String(req.body?.confirmarIdentificacion || "").trim() !== confirmationExpected) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Escribe exactamente el documento de la persona para confirmar el borrado definitivo.",
        });
      }

      if (req.user?.id) {
        const { rows: sessionOwnerRows } = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM sat.usuarios
             WHERE id_usuarios::text = $1
               AND (id_personas = $2 OR numero_documento = $3)
           ) AS es_usuario_actual`,
          [String(req.user.id), persona.idPersona, persona.identificacion],
        );
        if (sessionOwnerRows[0].es_usuario_actual) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "No puedes borrar tu propia cuenta activa desde esta sesión. Inicia sesión con otra cuenta administradora para hacerlo.",
          });
        }
      }

      const { rowCount: inscripcionesEliminadas } = await client.query(
        `DELETE FROM sat.actividades_vec_participantes avp
         USING sat.participantes_vec pv
         WHERE avp.id_participantes_vec = pv.id_participantes_vec
           AND pv.id_personas = $1`,
        [persona.idPersona],
      );
      const { rowCount: perfilesEliminados } = await client.query(
        "DELETE FROM sat.participantes_vec WHERE id_personas = $1",
        [persona.idPersona],
      );
      const { rowCount: docentesEliminados } = await client.query(
        "DELETE FROM sat.docentes WHERE id_personas = $1 OR numero_documento = $2",
        [persona.idPersona, persona.identificacion],
      );
      const { rowCount: usuariosEliminados } = await client.query(
        "DELETE FROM sat.usuarios WHERE id_personas = $1 OR numero_documento = $2",
        [persona.idPersona, persona.identificacion],
      );
      const { rows: personasEliminadas } = await client.query(
        "DELETE FROM sat.personas WHERE id = $1 RETURNING id",
        [persona.idPersona],
      );
      if (!personasEliminadas[0]) {
        throw Object.assign(new Error("No se pudo borrar completamente a la persona."), { status: 409 });
      }

      await client.query("COMMIT");
      return res.json({
        eliminado: true,
        definitivo: true,
        mensaje: `Se borró definitivamente a ${persona.nombre || "la persona"}: sus perfiles, sus ${inscripcionesEliminadas} inscripción(es) y sus datos vinculados.`,
        perfilesEliminados,
        inscripcionesEliminadas,
        cuentasEliminadas: usuariosEliminados,
        registrosDocentesEliminados: docentesEliminados,
      });
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (err.code === "23503") {
        return res.status(409).json({
          error: "No se borró ningún dato: existen otros registros relacionados que impiden eliminar a esta persona.",
        });
      }
      if (err.status) return res.status(err.status).json({ error: err.message });
      return enviarErrorBaseDatos(err, res, next);
    } finally {
      client?.release();
    }
  },
);

router.delete("/perfiles/roles/:id", requireRole("admin", "coordinador", "administrador"), async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_PATTERN.test(id)) return res.status(400).json({ error: "Identificador de perfil inválido." });

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT pv.id_participantes_vec AS id, pv.tipo_participante AS rol,
              pv.id_personas AS "idPersona", p.numero_identificacion AS identificacion
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE pv.id_participantes_vec = $1
         AND pv.tipo_participante IN ('EGRESADO', 'COLABORADOR', 'EXTERNO')
       FOR UPDATE OF pv, p`,
      [id],
    );
    const perfil = rows[0];
    if (!perfil) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No se encontró el perfil de rol indicado." });
    }

    const rolesInstitucionales = await obtenerRolesVerificados(
      client,
      perfil.idPersona,
      perfil.identificacion,
    );
    const { rows: estudianteVec } = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM sat.participantes_vec
         WHERE id_personas = $1 AND tipo_participante = 'ESTUDIANTE'
       ) AS existe`,
      [perfil.idPersona],
    );
    const datosPersonalesProtegidos = rolesInstitucionales.some(
      (rol) => rol === "ESTUDIANTE" || rol === "COLABORADOR",
    ) || estudianteVec[0].existe;
    const tieneRolEstudiante = rolesInstitucionales.includes("ESTUDIANTE") || estudianteVec[0].existe;

    const { rows: inscripciones } = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM sat.actividades_vec_participantes
       WHERE id_participantes_vec = $1`,
      [id],
    );
    const totalInscripciones = inscripciones[0].total;
    if (totalInscripciones > 0 && req.body?.confirmarInscripciones !== true) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "PROFILE_DELETE_CONFIRMATION_REQUIRED",
        totalInscripciones,
        datosPersonalesProtegidos,
        tieneRolEstudiante,
        error: "Confirma que deseas quitar este rol de Actividades y sus inscripciones. La persona y sus otros roles se conservarán.",
      });
    }

    const { rowCount: inscripcionesEliminadas } = await client.query(
      `DELETE FROM sat.actividades_vec_participantes
       WHERE id_participantes_vec = $1`,
      [id],
    );

    const { rows: perfilesEliminados } = await client.query(
      `DELETE FROM sat.participantes_vec
       WHERE id_participantes_vec = $1
       RETURNING id_participantes_vec`,
      [id],
    );
    if (!perfilesEliminados[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "No se pudo quitar el rol. Actualiza la lista e inténtalo de nuevo." });
    }

    const { rows: otrosPerfiles } = await client.query(
      `SELECT 1 FROM sat.participantes_vec WHERE id_personas = $1 LIMIT 1`,
      [perfil.idPersona],
    );
    const { rows: fuentesInstitucionales } = await client.query(
      `SELECT (
         EXISTS (SELECT 1 FROM sat.estudiantes
                 WHERE id_personas = $1 OR numero_documento = $2)
         OR EXISTS (SELECT 1 FROM sat.usuarios
                    WHERE id_personas = $1 OR numero_documento = $2)
         OR EXISTS (SELECT 1 FROM sat.docentes
                    WHERE id_personas = $1 OR numero_documento = $2)
       ) AS vinculada`,
      [perfil.idPersona, perfil.identificacion],
    );
    let personaEliminada = false;
    if (!otrosPerfiles[0] && !fuentesInstitucionales[0].vinculada) {
      await client.query("SAVEPOINT eliminar_persona_rol");
      try {
        const { rows: personasEliminadas } = await client.query(
          `DELETE FROM sat.personas WHERE id = $1 RETURNING id`,
          [perfil.idPersona],
        );
        personaEliminada = Boolean(personasEliminadas[0]);
        await client.query("RELEASE SAVEPOINT eliminar_persona_rol");
      } catch (err) {
        if (err.code !== "23503") throw err;
        await client.query("ROLLBACK TO SAVEPOINT eliminar_persona_rol");
        await client.query("RELEASE SAVEPOINT eliminar_persona_rol");
      }
    }

    await client.query("COMMIT");
    return res.json({
      eliminado: true,
      rol: perfil.rol,
      inscripcionesEliminadas,
      datosPersonalesProtegidos,
      personaEliminada,
      mensaje: datosPersonalesProtegidos
        ? `Se quitó únicamente el rol ${perfil.rol} de Actividades y ${inscripcionesEliminadas} inscripción(es). La persona, el rol Estudiante y sus datos institucionales se conservaron.`
        : personaEliminada
          ? `Se eliminó el perfil ${perfil.rol} y sus ${inscripcionesEliminadas} inscripción(es).`
          : `Se quitó el perfil ${perfil.rol} y sus ${inscripcionesEliminadas} inscripción(es). Los demás roles y datos vinculados se conservaron.`,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23503") {
      return res.status(409).json({ error: "No se pudo quitar el rol porque tiene otros registros relacionados." });
    }
    return enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.post("/registro-actividad/masivo", async (req, res, next) => {
  const idActividad = String(req.body?.idActividad || "").trim();
  const filas = req.body?.participantes;
  if (!UUID_PATTERN.test(idActividad)) return res.status(400).json({ error: "Selecciona una actividad válida." });
  if (!Array.isArray(filas) || filas.length < 1 || filas.length > 500) {
    return res.status(400).json({ error: "La carga debe contener entre 1 y 500 participantes." });
  }

  let validatedRows;
  try {
    validatedRows = await validarCargaMasiva(idActividad, filas);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return enviarErrorBaseDatos(err, res, next);
  }

  const resultados = validatedRows
    .filter((row) => row.status !== "valid")
    .map((row) => ({
      fila: row.fila,
      identificacion: row.participante.identificacion,
      status: row.status,
      message: row.message,
    }));
  const validRows = validatedRows.filter((row) => row.status === "valid");
  if (!validRows.length) {
    return res.json({ registrados: 0, participantes: resultados });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows: eventos } = await client.query(
      `SELECT estado, fecha_finalizacion::date::text AS "fechaFinalizacion",
              variables_modalidades AS "variablesModalidades"
       FROM sat.actividades_vec
       WHERE id_actividades_vec = $1
       FOR UPDATE`,
      [idActividad]
    );
    const actividad = eventos[0];
    if (!actividad || actividad.estado === "CANCELADA") {
      throw Object.assign(new Error("La actividad ya no está disponible para recibir participantes."), { status: 409 });
    }

    const { rows: modalidades } = await client.query(
      `SELECT programa, id_tipos_apoyo AS "idTipoApoyo"
       FROM sat.actividades_vec_modalidades
       WHERE id_actividades_vec = $1
       FOR SHARE`,
      [idActividad]
    );
    const apoyoPorModalidad = new Map(modalidades.map((item) => [item.programa, item.idTipoApoyo]));
    for (const row of validRows) {
      await client.query("SAVEPOINT registrar_participante");
      try {
        if (actividad.variablesModalidades?.length && !row.variable) {
          throw Object.assign(new Error("Selecciona una variable o modalidad antes de registrar a esta persona."), { status: 409 });
        }
        if (row.variable) {
          if (!actividad.variablesModalidades?.includes(row.variable)
            || apoyoPorModalidad.get(row.variable) !== row.idTipoApoyo) {
            throw Object.assign(new Error("La modalidad seleccionada ya no está disponible."), { status: 409 });
          }
        } else if (row.idTipoApoyo) {
          throw Object.assign(new Error("La actividad ya no tiene modalidad para este registro."), { status: 409 });
        }
        const rolesRegistrados = [];
        for (const tipo of row.participante.rolesPendientes || row.participante.roles || [row.participante.tipo]) {
          if (tipo === "ESTUDIANTE"
            && !await existeEstudianteInstitucional(client, row.participante.identificacion)) {
            throw Object.assign(new Error("No se puede registrar como estudiante porque no existe en los registros institucionales."), { status: 409 });
          }
          const profile = await guardarPerfilDeActividad(client, {
            ...row.participante,
            tipo,
          });
          const { rows: inserted } = await client.query(
            `INSERT INTO sat.actividades_vec_participantes
               (id_actividades_vec, id_participantes_vec, id_tipos_apoyo, programa_modalidad)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id_actividades_vec, id_participantes_vec) DO NOTHING
             RETURNING id_actividades_vec_participantes AS id`,
            [idActividad, profile.idParticipante, row.idTipoApoyo || null, row.variable || null]
          );
          if (!inserted[0]) {
            throw Object.assign(new Error(`La persona ya está registrada en esta actividad con el rol ${tipo}.`), { status: 409 });
          }
          rolesRegistrados.push(tipo);
        }
        resultados.push({
          fila: row.fila,
          identificacion: row.participante.identificacion,
          rol: rolesRegistrados.join(", "),
          roles: rolesRegistrados,
          status: "registered",
          message: `Registro completado con los roles: ${rolesRegistrados.join(", ")}.`,
        });
        await client.query("RELEASE SAVEPOINT registrar_participante");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT registrar_participante");
        await client.query("RELEASE SAVEPOINT registrar_participante");
        if (!err.status && !err.code) {
          throw err;
        }
        if (err.code) {
          console.error(
            `[Actividades] No se pudo registrar la fila ${row.fila} (SQLSTATE ${err.code}${err.constraint ? `, constraint ${err.constraint}` : ""}).`,
          );
        }
        resultados.push({
          fila: row.fila,
          identificacion: row.participante.identificacion,
          status: "failed",
          message: mensajeErrorInscripcionMasiva(err),
        });
      }
    }
    await client.query("COMMIT");
    const registrados = resultados.filter((row) => row.status === "registered").length;
    res.status(registrados ? 201 : 200).json({ registrados, participantes: resultados });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code) {
      const requiereMigracion = ["42P01", "42703", "42P10"].includes(err.code);
      console.error(`[Actividades] Falló la carga masiva antes de completar (SQLSTATE ${err.code}).`);
      return res.status(requiereMigracion ? 503 : 500).json({
        error: mensajeErrorInscripcionMasiva(err),
      });
    }
    enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

function mensajeErrorInscripcionMasiva(err) {
  if (err.status) return err.message;
  switch (err.code) {
    case "23505":
      return "La persona ya tiene un perfil o inscripción duplicada.";
    case "23514":
      return "La persona no puede combinar el rol Externo con otros roles.";
    case "23503":
      return "No se encontró una relación requerida para el perfil o la actividad.";
    case "23502":
      return "Falta un dato obligatorio para guardar el perfil.";
    case "22P02":
    case "22007":
      return "Uno de los datos tiene un formato no válido.";
    case "42P01":
    case "42703":
    case "42P10":
      return `La base de datos de Actividades requiere actualizar sus migraciones (referencia ${err.code}).`;
    default:
      return `No se pudo guardar esta inscripción por un error de base de datos (referencia ${err.code}).`;
  }
}

router.post("/registro-actividad/masivo/registrar-no-encontrado", async (req, res, next) => {
  const idActividad = String(req.body?.idActividad || "").trim();
  const participante = normalizarEntrada({
    ...req.body?.participante,
    tipo: req.body?.participante?.tipo,
  });
  const fila = Number(req.body?.participante?.fila) || 2;

  if (!UUID_PATTERN.test(idActividad)) {
    return res.status(400).json({ error: "Selecciona una actividad válida." });
  }
  if (!participante.identificacion) {
    return res.status(400).json({ error: "Ingresa el número de documento para crear el perfil." });
  }
  if (!participante.nombres || !participante.apellidos) {
    return res.status(400).json({ error: "Completa los nombres y apellidos antes de registrar a la persona." });
  }
  if (!["EGRESADO", "COLABORADOR", "EXTERNO"].includes(participante.tipo)) {
    return res.status(400).json({
      error: "Solo puedes crear participantes no encontrados como Egresado, Colaborador o Externo. Los estudiantes y el personal administrativo deben existir en la base institucional.",
    });
  }
  if (!TIPOS_DOCUMENTO_PARTICIPANTE.has(participante.tipoDocumento)) {
    return res.status(400).json({ error: "Selecciona un tipo de documento válido." });
  }
  participante.detalleTipoParticipante = DETALLE_ROL_PARTICIPANTE[participante.tipo];
  const datosObligatorios = [
    ["tipo de documento", participante.tipoDocumento],
    ["fecha de nacimiento", participante.fechaNacimiento],
    ["lugar de nacimiento", participante.lugarNacimiento],
    ["género", participante.genero],
    ["correo personal", participante.correo],
    ["teléfono móvil", participante.celular],
    ["teléfono alternativo", participante.telefono],
    ["dirección de residencia", participante.direccion],
    ["ciudad o municipio de residencia", participante.municipio],
  ];
  const datoFaltante = datosObligatorios.find(([, value]) => !value);
  if (datoFaltante) {
    return res.status(400).json({ error: `Completa el campo obligatorio: ${datoFaltante[0]}.` });
  }
  participante.codigo = null;
  participante.correoInstitucional = null;
  if (!/^[\p{L}\p{N}._-]{1,64}$/u.test(participante.identificacion)) {
    return res.status(400).json({
      error: "El número de documento debe contener máximo 64 letras o números; se permiten punto, guion y guion bajo.",
    });
  }
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,119}$/u.test(participante.nombres)) {
    return res.status(400).json({ error: "Escribe nombres válidos de 2 a 120 caracteres." });
  }
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,119}$/u.test(participante.apellidos)) {
    return res.status(400).json({ error: "Escribe apellidos válidos de 2 a 120 caracteres." });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(participante.correo) || participante.correo.length > 254) {
    return res.status(400).json({ error: "Ingresa un correo personal válido de máximo 254 caracteres." });
  }
  for (const [label, value] of [
    ["teléfono móvil", participante.celular],
    ["teléfono alternativo", participante.telefono],
  ]) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
      return res.status(400).json({ error: `Ingresa un ${label} válido de 7 a 15 dígitos.` });
    }
  }
  for (const [label, value, maxLength] of [
    ["lugar de nacimiento", participante.lugarNacimiento, 250],
    ["dirección de residencia", participante.direccion, 250],
    ["ciudad o municipio", participante.municipio, 150],
  ]) {
    if (value.length > maxLength) {
      return res.status(400).json({ error: `El campo ${label} debe tener máximo ${maxLength} caracteres.` });
    }
  }
  if (!["Femenino", "Masculino", "No binario", "Otro", "Prefiero no responder"].includes(participante.genero)) {
    return res.status(400).json({ error: "Selecciona una opción válida para el género." });
  }
  const fechaNacimientoParseada = participante.fechaNacimiento
    ? new Date(`${participante.fechaNacimiento}T00:00:00.000Z`)
    : null;
  if (participante.fechaNacimiento
    && (!/^\d{4}-\d{2}-\d{2}$/.test(participante.fechaNacimiento)
      || Number.isNaN(fechaNacimientoParseada.getTime())
      || fechaNacimientoParseada.toISOString().slice(0, 10) !== participante.fechaNacimiento
      || participante.fechaNacimiento > new Date().toISOString().slice(0, 10))) {
    return res.status(400).json({ error: "La fecha de nacimiento debe ser una fecha real que no sea posterior a hoy." });
  }
  let validacion;
  try {
    [validacion] = await validarCargaMasiva(idActividad, [{
      ...participante,
      fila,
      codigoInstitucional: null,
      modalidadVariable: req.body?.participante?.modalidadVariable,
    }]);
    if (!["not_found", "valid"].includes(validacion.status)) {
      if (validacion.status === "duplicate") {
        return res.status(409).json({
          error: "La persona ya existe en la base de datos o ya está inscrita. Vuelve a validar el archivo.",
        });
      }
      return res.status(400).json({ error: validacion.message || "No se pudo validar el registro de la persona." });
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return enviarErrorBaseDatos(err, res, next);
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows: eventos } = await client.query(
      `SELECT estado, variables_modalidades AS "variablesModalidades"
       FROM sat.actividades_vec
       WHERE id_actividades_vec = $1
       FOR UPDATE`,
      [idActividad]
    );
    const actividad = eventos[0];
    if (!actividad || actividad.estado === "CANCELADA") {
      throw Object.assign(new Error("La actividad ya no está disponible para recibir participantes."), { status: 409 });
    }

    if (actividad.variablesModalidades?.length && !validacion.variable) {
      throw Object.assign(new Error("Selecciona una variable o modalidad antes de registrar a esta persona."), { status: 409 });
    }
    if (validacion.variable) {
      if (!actividad.variablesModalidades?.includes(validacion.variable)) {
        throw Object.assign(new Error("La modalidad seleccionada ya no está disponible para esta actividad."), { status: 409 });
      }
      const { rows: modalidades } = await client.query(
        `SELECT modalidad.id_tipos_apoyo AS id
         FROM sat.actividades_vec_modalidades modalidad
         JOIN sat.apoyos_actividades_vec apoyo
           ON apoyo.id_tipos_apoyo = modalidad.id_tipos_apoyo
          AND apoyo.activo = true
         WHERE modalidad.id_actividades_vec = $1
           AND modalidad.programa = $2
         LIMIT 1`,
        [idActividad, validacion.variable]
      );
      if (!modalidades[0] || String(modalidades[0].id) !== String(validacion.idTipoApoyo)) {
        throw Object.assign(new Error("El apoyo asociado a la modalidad cambió. Vuelve a validar el archivo."), { status: 409 });
      }
    }

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [participante.identificacion],
    );
    const { rows: existingPerson } = await client.query(
      `SELECT id
       FROM sat.personas
       WHERE numero_identificacion = $1
       FOR UPDATE`,
      [participante.identificacion]
    );
    const existingProfile = existingPerson[0]
      ? { id: existingPerson[0].id }
      : await buscarPersonaFuente(client, participante.identificacion);
    if (existingProfile) {
      const rolesInstitucionales = await obtenerRolesVerificados(
        client,
        existingProfile.id,
        participante.identificacion,
      );
      const { rows: perfilesExistentes } = await client.query(
        `SELECT tipo_participante AS rol
         FROM sat.participantes_vec
         WHERE id_personas = $1`,
        [existingProfile.id]
      );
      const rolesExistentes = [
        ...new Set([
          ...rolesInstitucionales,
          ...perfilesExistentes.map(({ rol }) => rol),
        ]),
      ];
      if (participante.tipo === "EXTERNO" && rolesExistentes.some((role) => role !== "EXTERNO")) {
        throw Object.assign(new Error("La persona ya tiene otro rol y no puede registrarse como externa."), { status: 409 });
      }
      if (participante.tipo !== "EXTERNO" && rolesExistentes.includes("EXTERNO")) {
        throw Object.assign(new Error("Esta persona tiene el rol Externo, que es exclusivo y no admite otros roles."), { status: 409 });
      }
      const { rows: existingRole } = await client.query(
        `SELECT id_participantes_vec
         FROM sat.participantes_vec
         WHERE id_personas = $1
           AND tipo_participante = $2
         LIMIT 1`,
        [existingProfile.id, participante.tipo]
      );
      if (existingRole[0]) {
        throw Object.assign(new Error("La persona ya tiene este rol registrado. Vuelve a validar el archivo."), { status: 409 });
      }
    }

    const profile = await guardarPerfilDeActividad(client, {
      ...participante,
      tipo: participante.tipo,
      detalleTipoParticipante: DETALLE_ROL_PARTICIPANTE[participante.tipo],
      codigo: participante.tipo === "ESTUDIANTE" ? participante.codigo : null,
    });
    const { rows: inscripciones } = await client.query(
      `INSERT INTO sat.actividades_vec_participantes
         (id_actividades_vec, id_participantes_vec, id_tipos_apoyo, programa_modalidad)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_actividades_vec, id_participantes_vec) DO NOTHING
       RETURNING id_actividades_vec_participantes AS id`,
      [idActividad, profile.idParticipante, validacion.idTipoApoyo || null, validacion.variable || null]
    );
    if (!inscripciones[0]) {
      throw Object.assign(new Error("La persona ya está inscrita en esta actividad."), { status: 409 });
    }

    await client.query("COMMIT");
    return res.status(201).json({
      registrado: true,
      rol: participante.tipo,
      idInscripcion: inscripciones[0].id,
      identificacion: participante.identificacion,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ya existe un perfil con esa identificación. Vuelve a validar el archivo." });
    }
    if (err.code === "23514") {
      return res.status(409).json({ error: "El rol Externo es exclusivo y no se puede combinar con otros roles." });
    }
    if (err.code === "23502") {
      return res.status(400).json({ error: "Falta completar un dato obligatorio del perfil." });
    }
    if (err.code === "22P02" || err.code === "22007") {
      return res.status(400).json({ error: "Uno de los datos tiene un formato no válido. Revisa la fecha y los campos numéricos." });
    }
    return enviarErrorBaseDatos(err, res, next);
  } finally {
    client?.release();
  }
});

router.post("/registro-estudiante", (req, res, next) => (
  registrarActividad(req, res, next, "ESTUDIANTE")
));

router.post("/registro-actividad", (req, res, next) => registrarActividad(req, res, next));

export async function crearActividadTransaccion(client, activity, userId) {
  const catalog = await obtenerCatalogoActividadManual(client, activity);
  return insertarActividadTransaccion(client, activity, catalog, userId);
}

async function insertarActividadTransaccion(client, activity, catalog, userId) {
  const { rows } = await client.query(
    `INSERT INTO sat.actividades_vec (
       id_periodos_academicos, id_catalogo_actividades_vec, actividad,
       descripcion_actividad, proyecto, tipo_actividad, tipo_actividad_otra,
       alianza_interinstitucional, entidad_alianza, articulacion_institucional,
       id_dependencias, dependencia_otra, modalidad, fecha_inicio, fecha_finalizacion,
       id_programas_bienestar, estrategia_politica_bienestar,
       estrategia_politica_permanencia, estrategia_politica_educacion_inclusiva,
       ubicacion, variables_modalidades
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id_actividades_vec AS id, estado`,
    [activity.idPeriodo, catalog.id, activity.nombreActividad || catalog.actividad,
      activity.descripcion || catalog.descripcion,
      catalog.proyecto, catalog.tipo, activity.tipoOtra, activity.alianza,
      activity.entidadAlianza, activity.articulacion, activity.idDependencia,
      activity.dependenciaOtra, activity.modalidad, activity.fechaInicio,
      activity.fechaFinalizacion, catalog.idProgramaBienestar,
      catalog.estrategiaBienestar || activity.estrategiaBienestar,
      catalog.estrategiaPermanencia || activity.estrategiaPermanencia,
      catalog.estrategiaInclusiva || activity.estrategiaInclusiva,
      activity.ubicacion, activity.subdivisionProgramas]
  );
  await guardarModalidadesActividad(client, rows[0].id, catalog.modalidades);
  await client.query(
    `INSERT INTO sat.actividades_vec_auditoria (id_actividades_vec, accion, id_usuario, detalle)
     VALUES ($1, 'CREAR', $2, $3::jsonb)`,
    [rows[0].id, String(userId || ""), JSON.stringify(activity)]
  );
  return rows[0];
}

async function guardarModalidadesActividad(client, idActividad, modalidades = []) {
  await client.query(
    "DELETE FROM sat.actividades_vec_modalidades WHERE id_actividades_vec = $1",
    [idActividad]
  );
  for (const modalidad of modalidades) {
    await client.query(
      `INSERT INTO sat.actividades_vec_modalidades
         (id_actividades_vec, programa, id_tipos_apoyo)
       VALUES ($1, $2, $3)`,
      [idActividad, modalidad.programaCompleto, modalidad.idTipoApoyo]
    );
  }
}

async function obtenerCatalogoActividadManual(client, activity) {
  const bienestar = await obtenerProgramaBienestar(client, activity);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [HOJA_REGISTRO_MANUAL]);
  let { rows } = await client.query(
    `SELECT id_catalogo_actividades_vec AS id, tipo_actividad AS tipo, proyecto
     FROM sat.catalogo_actividades_vec
     WHERE hoja_origen = $1
       AND tipo_registro = 'ACTIVIDAD'
       AND LOWER(BTRIM(actividad)) = LOWER(BTRIM($2))
       AND LOWER(BTRIM(programa)) IS NOT DISTINCT FROM LOWER(BTRIM($3))
     ORDER BY fila_origen
     LIMIT 1
     FOR UPDATE`,
    [HOJA_REGISTRO_MANUAL, activity.nombreActividad, bienestar.programa]
  );
  if (rows[0]) return completarCatalogoManual(rows[0], bienestar);

  const { rows: sequenceRows } = await client.query(
    `SELECT COALESCE(MAX(fila_origen), 1) + 1 AS fila
     FROM sat.catalogo_actividades_vec
     WHERE hoja_origen = $1`,
    [HOJA_REGISTRO_MANUAL]
  );
  ({ rows } = await client.query(
    `INSERT INTO sat.catalogo_actividades_vec
       (hoja_origen, fila_origen, tipo_registro, actividad, proyecto,
        programa, componente, linea_accion)
     VALUES ($1, $2, 'ACTIVIDAD', $3, $3, $4, $5, $6)
     RETURNING id_catalogo_actividades_vec AS id, tipo_actividad AS tipo, proyecto`,
    [HOJA_REGISTRO_MANUAL, sequenceRows[0].fila, activity.nombreActividad,
      bienestar.programa, bienestar.componente, bienestar.lineaAccion]
  ));
  return completarCatalogoManual(rows[0], bienestar);
}

async function obtenerProgramaBienestar(client, activity) {
  if (!activity.programaBienestar) {
    if (activity.subdivisionProgramas.length) {
      throw Object.assign(new Error("Selecciona el programa general de Bienestar para las variables o modalidades indicadas."), { status: 400 });
    }
    return {
      programa: null,
      componente: null,
      lineaAccion: null,
      tipoApoyo: null,
      idProgramaBienestar: null,
      estrategiaBienestar: null,
      estrategiaPermanencia: null,
      estrategiaInclusiva: null,
    };
  }

  const { rows: catalogRows } = await client.query(
    `WITH programas_base AS (
       SELECT bienestar.*,
              CASE
                WHEN POSITION(' - ' IN programa) > 0
                  THEN BTRIM(SUBSTRING(programa FROM 1 FOR POSITION(' - ' IN programa) - 1))
                WHEN programa ~* ' \\((participantes|grupos?)([[:space:]][^()]*)?\\)$'
                  THEN REGEXP_REPLACE(programa, ' \\((participantes|grupos?)([[:space:]][^()]*)?\\)$', '', 'i')
                ELSE programa
              END AS programa_general
       FROM sat.catalogo_bienestar_actividades bienestar
       WHERE NULLIF(BTRIM(programa), '') IS NOT NULL
     ),
     programas AS (
       SELECT programas_base.*,
              COUNT(*) OVER (PARTITION BY LOWER(BTRIM(programa_general))) AS total_programas
       FROM programas_base
     ),
     programas_normalizados AS (
       SELECT CASE WHEN total_programas > 1 THEN programa_general ELSE programa END AS programa_general,
              programa AS programa_completo,
              CASE WHEN total_programas <= 1
                     OR LOWER(BTRIM(programa)) = LOWER(BTRIM(programa_general)) THEN NULL
                   WHEN POSITION(' - ' IN programa) > 0
                     THEN BTRIM(SUBSTRING(programa FROM POSITION(' - ' IN programa) + 3))
                   ELSE BTRIM(SUBSTRING(programa FROM LENGTH(programa_general) + 1), ' ()')
              END AS subdivision,
              componente, linea_accion, numero_tipo_apoyo,
              estrategia_politica_bienestar, estrategia_politica_permanencia,
              estrategia_politica_educacion_inclusiva
       FROM programas
     )
     SELECT programas_normalizados.programa_completo AS programa,
            programas_normalizados.componente,
            programas_normalizados.linea_accion AS "lineaAccion",
            programas_normalizados.subdivision,
           apoyo.id_tipos_apoyo AS "idTipoApoyo",
           programas_normalizados.estrategia_politica_bienestar AS "estrategiaBienestar",
           programas_normalizados.estrategia_politica_permanencia AS "estrategiaPermanencia",
           programas_normalizados.estrategia_politica_educacion_inclusiva AS "estrategiaInclusiva",
            (SELECT pb.id_programas_bienestar
             FROM sat.programas_bienestar pb
             WHERE pb.activo = true
               AND LOWER(BTRIM(pb.nombre)) = LOWER(BTRIM(programas_normalizados.programa_general))
             ORDER BY pb.id_programas_bienestar
             LIMIT 1) AS "idProgramaBienestar"
     FROM programas_normalizados
     LEFT JOIN LATERAL (
       SELECT ta.id_tipos_apoyo
       FROM sat.apoyos_actividades_vec ta
       WHERE ta.activo = true
         AND ta.numero = programas_normalizados.numero_tipo_apoyo
       ORDER BY ta.id_tipos_apoyo
       LIMIT 1
     ) apoyo ON true
     WHERE LOWER(BTRIM(programas_normalizados.programa_general)) = LOWER(BTRIM($1))
     ORDER BY (programas_normalizados.programa_completo = programas_normalizados.programa_general) DESC,
              programas_normalizados.programa_completo`,
    [activity.programaBienestar]
  );
  const rows = catalogRows.map((row) => ({
    ...row,
    tipoApoyo: bienestarFuentePorPrograma.get(row.programa)?.tipoApoyoExcel || null,
  }));
  if (!rows.length) {
    throw Object.assign(new Error("El programa de Bienestar seleccionado no existe en el catálogo."), { status: 400 });
  }
  const selectedNames = activity.subdivisionProgramas;
  const selectedPrograms = selectedNames.map((name) => rows.find((row) => row.programa === name));
  if (selectedPrograms.some((row) => !row)) {
    throw Object.assign(new Error("Una variable o modalidad no corresponde al programa de Bienestar seleccionado."), { status: 400 });
  }
  if (rows.some((row) => row.subdivision) && !selectedPrograms.length) {
    throw Object.assign(new Error("Selecciona al menos un apoyo para esta actividad. Puedes elegir uno solo aunque el programa tenga varias opciones."), { status: 400 });
  }
  if (selectedPrograms.some((row) => !row.idTipoApoyo)) {
    const missingSupport = selectedPrograms.find((row) => !row.idTipoApoyo);
    throw Object.assign(
      new Error(
        `El apoyo "${missingSupport?.tipoApoyo || missingSupport?.programa}" no tiene un tipo de apoyo activo asociado. Vuelve a ejecutar la migración de Actividades y verifica que el apoyo esté activo.`,
      ),
      { status: 409 }
    );
  }
  const programaSeleccionado = selectedPrograms[0]
    || rows.find((row) => row.programa === activity.programaBienestar);
  return programaSeleccionado ? {
    ...programaSeleccionado,
    modalidades: selectedPrograms.map((row) => ({
      programaCompleto: row.programa,
      idTipoApoyo: row.idTipoApoyo,
    })),
  } : {
    programa: null,
    componente: null,
    lineaAccion: null,
    tipoApoyo: null,
    idProgramaBienestar: null,
    estrategiaBienestar: null,
    estrategiaPermanencia: null,
    estrategiaInclusiva: null,
    modalidades: [],
  };
}

function completarCatalogoManual(catalog, bienestar) {
  return {
    ...catalog,
    descripcion: null,
    ...bienestar,
  };
}

async function guardarPerfilDeActividad(client, participante) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [participante.identificacion]);
  let persona = await buscarPersonaPorIdentificacion(client, participante.identificacion);
  if (!persona) persona = await buscarPersonaFuente(client, participante.identificacion);
  let personaNueva = false;
  if (!persona) {
    const nombre = dividirNombre(participante.nombres);
    const apellidos = dividirNombre(participante.apellidos);
    const { rows } = await client.query(
      `INSERT INTO sat.personas (
         numero_identificacion, primer_nombre, segundo_nombre, primer_apellido,
         segundo_apellido, genero, fecha_nacimiento, correo_electronico,
         correo_institucional, celular, telefono, direccion
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (numero_identificacion) DO NOTHING RETURNING id`,
      [participante.identificacion, nombre.primero, nombre.segundo,
        apellidos.primero, apellidos.segundo, normalizarGeneroPersona(participante.genero),
        participante.fechaNacimiento, participante.correo, participante.correoInstitucional,
        participante.celular, participante.telefono, participante.direccion]
    );
    personaNueva = Boolean(rows[0]);
    persona = rows[0] || await buscarPersonaPorIdentificacion(client, participante.identificacion);
  }
  if (!persona?.id) throw Object.assign(new Error("No se pudo resolver la persona en sat.personas."), { status: 409 });

  await vincularFuentesExistentes(client, persona.id, participante.identificacion);

  const names = dividirNombre(participante.nombres);
  const surnames = dividirNombre(participante.apellidos);
  await client.query(
    `UPDATE sat.personas SET
       primer_nombre=COALESCE(NULLIF(primer_nombre,''), $2),
       segundo_nombre=COALESCE(NULLIF(segundo_nombre,''), $3),
       primer_apellido=COALESCE(NULLIF(primer_apellido,''), $4),
       segundo_apellido=COALESCE(NULLIF(segundo_apellido,''), $5),
       genero=COALESCE(NULLIF(genero,''), $6),
       fecha_nacimiento=COALESCE(fecha_nacimiento, $7),
       correo_electronico=COALESCE(NULLIF(correo_electronico,''), $8),
       correo_institucional=COALESCE(NULLIF(correo_institucional,''), $9),
       celular=COALESCE(NULLIF(celular,''), $10),
       telefono=COALESCE(NULLIF(telefono,''), $11),
       direccion=COALESCE(NULLIF(direccion,''), $12)
     WHERE id=$1`,
    [persona.id, names.primero, names.segundo, surnames.primero, surnames.segundo,
      normalizarGeneroPersona(participante.genero), participante.fechaNacimiento, participante.correo,
      participante.correoInstitucional, participante.celular, participante.telefono,
      participante.direccion]
  );

  const rolesVerificados = await obtenerRolesVerificados(client, persona.id, participante.identificacion);

  // Reutilizar el perfil existente y completar los datos aportados sin reemplazar
  // información institucional ya registrada.
  const { rows: profiles } = await client.query(
    `INSERT INTO sat.participantes_vec (
       id_personas, tipo_participante, detalle_tipo_participante, tipo_documento, codigo, programa_academico,
       programa_posgrado_dependencia, semestre, jornada, dependencia, cargo,
       fecha_egreso, lugar_nacimiento, etnia, municipio, discapacidad, conflicto_armado
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id_personas, tipo_participante) DO UPDATE SET
       detalle_tipo_participante=COALESCE(NULLIF(sat.participantes_vec.detalle_tipo_participante, ''), EXCLUDED.detalle_tipo_participante),
       tipo_documento=COALESCE(NULLIF(sat.participantes_vec.tipo_documento, ''), EXCLUDED.tipo_documento),
       codigo=CASE WHEN EXCLUDED.tipo_participante <> 'ESTUDIANTE' THEN NULL
                   ELSE COALESCE(NULLIF(sat.participantes_vec.codigo, ''), EXCLUDED.codigo) END,
       programa_academico=COALESCE(NULLIF(sat.participantes_vec.programa_academico, ''), EXCLUDED.programa_academico),
       programa_posgrado_dependencia=COALESCE(NULLIF(sat.participantes_vec.programa_posgrado_dependencia, ''), EXCLUDED.programa_posgrado_dependencia),
       semestre=COALESCE(sat.participantes_vec.semestre, EXCLUDED.semestre),
       jornada=COALESCE(NULLIF(sat.participantes_vec.jornada, ''), EXCLUDED.jornada),
       dependencia=COALESCE(NULLIF(sat.participantes_vec.dependencia, ''), EXCLUDED.dependencia),
       cargo=COALESCE(NULLIF(sat.participantes_vec.cargo, ''), EXCLUDED.cargo),
       fecha_egreso=COALESCE(sat.participantes_vec.fecha_egreso, EXCLUDED.fecha_egreso),
       lugar_nacimiento=COALESCE(NULLIF(sat.participantes_vec.lugar_nacimiento, ''), EXCLUDED.lugar_nacimiento),
       etnia=COALESCE(NULLIF(sat.participantes_vec.etnia, ''), EXCLUDED.etnia),
       municipio=COALESCE(NULLIF(sat.participantes_vec.municipio, ''), EXCLUDED.municipio),
       discapacidad=COALESCE(NULLIF(sat.participantes_vec.discapacidad, ''), EXCLUDED.discapacidad),
       conflicto_armado=COALESCE(NULLIF(sat.participantes_vec.conflicto_armado, ''), EXCLUDED.conflicto_armado),
       actualizado_en=now()
     RETURNING id_participantes_vec AS id`,
    [persona.id, participante.tipo, participante.detalleTipoParticipante, participante.tipoDocumento, participante.codigo,
      participante.programaAcademico, participante.programaPosgradoDependencia,
      participante.semestre, participante.jornada, participante.dependencia,
      participante.cargo, participante.fechaEgreso, participante.lugarNacimiento,
      participante.etnia, participante.municipio,
      participante.discapacidad, participante.conflictoArmado]
  );
  return { idPersona: persona.id, idParticipante: profiles[0].id, personaNueva, rolesVerificados };
}

async function vincularFuentesExistentes(client, idPersona, identificacion) {
  await client.query(`UPDATE sat.estudiantes SET id_personas=$1 WHERE numero_documento=$2 AND id_personas IS NULL`, [idPersona, identificacion]);
  await client.query(`UPDATE sat.usuarios SET id_personas=$1 WHERE numero_documento=$2 AND id_personas IS NULL`, [idPersona, identificacion]);
  await client.query(`UPDATE sat.docentes SET id_personas=$1 WHERE numero_documento=$2 AND id_personas IS NULL`, [idPersona, identificacion]);
}

export async function agregarPersonaAEvento(
  client,
  idActividad,
  participante,
  idTipoApoyo,
  programaModalidad = null,
) {
  const { rows: eventRows } = await client.query(
    `SELECT id_actividades_vec, estado FROM sat.actividades_vec
     WHERE id_actividades_vec=$1 FOR UPDATE`,
    [idActividad]
  );
  if (!eventRows[0]) throw Object.assign(new Error("La actividad seleccionada no existe."), { status: 404 });
  if (eventRows[0].estado === "CANCELADA") throw Object.assign(new Error("No se pueden agregar personas a una actividad cancelada."), { status: 409 });
  const profile = await guardarPerfilDeActividad(client, participante);
  const { rows } = await client.query(
    `INSERT INTO sat.actividades_vec_participantes
       (id_actividades_vec, id_participantes_vec, id_tipos_apoyo, programa_modalidad)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id_actividades_vec, id_participantes_vec) DO NOTHING
     RETURNING id_actividades_vec_participantes AS id`,
    [idActividad, profile.idParticipante, idTipoApoyo || null, programaModalidad || null]
  );
  return { ...profile, idInscripcion: rows[0]?.id || null, yaInscrito: !rows[0] };
}

async function registrarActividad(req, res, next, tipoForzado = null) {
  const participante = normalizarEntrada({
    ...req.body.participante,
    tipo: tipoForzado || req.body.participante?.tipo,
  });
  if (participante.tipo !== "ESTUDIANTE") participante.codigo = null;
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
    `SELECT cat.id_catalogo_actividades_vec AS id,
              cat.actividad, cat.descripcion, cat.tipo_actividad AS tipo, cat.proyecto,
              bienestar.programa AS "programaBienestarCompleto",
              bienestar.estrategia_politica_bienestar AS "estrategiaBienestar",
              bienestar.estrategia_politica_permanencia AS "estrategiaPermanencia",
              bienestar.estrategia_politica_educacion_inclusiva AS "estrategiaInclusiva",
              cat.programa, cat.componente, cat.linea_accion,
              apoyo_modalidad.id_tipos_apoyo AS "idTipoApoyoModalidad",
              apoyo_sugerido.id_tipos_apoyo AS "idTipoApoyoSugerido",
              (SELECT pb.id_programas_bienestar
               FROM sat.programas_bienestar pb
               WHERE pb.activo = true
                 AND LOWER(BTRIM(pb.nombre)) = LOWER(BTRIM(cat.programa))
               ORDER BY pb.id_programas_bienestar
               LIMIT 1) AS "idProgramaBienestar"
       FROM sat.catalogo_actividades_vec cat
       LEFT JOIN sat.catalogo_bienestar_actividades bienestar
         ON translate(LOWER(BTRIM(bienestar.programa)), 'áéíóúüñ', 'aeiouun') = translate(LOWER(BTRIM(cat.programa)), 'áéíóúüñ', 'aeiouun')
       LEFT JOIN LATERAL (
         SELECT ta.id_tipos_apoyo
         FROM sat.apoyos_actividades_vec ta
         WHERE ta.activo = true
           AND ta.numero = bienestar.numero_tipo_apoyo
         ORDER BY ta.id_tipos_apoyo
         LIMIT 1
       ) apoyo_modalidad ON true
       LEFT JOIN LATERAL (
         SELECT ruta.id_tipos_apoyo
         FROM sat.rutas_remision ruta
         LEFT JOIN sat.programas_bienestar pb
           ON pb.id_programas_bienestar = ruta.id_programas_bienestar
         WHERE ruta.activo = true
           AND (
             LOWER(BTRIM(ruta.nombre)) = LOWER(BTRIM(COALESCE(cat.proyecto, '')))
             OR LOWER(BTRIM(ruta.nombre)) = LOWER(BTRIM(COALESCE(cat.actividad, '')))
             OR LOWER(BTRIM(pb.nombre)) = LOWER(BTRIM(COALESCE(cat.programa, '')))
           )
         ORDER BY CASE WHEN LOWER(BTRIM(ruta.nombre)) IN (
           LOWER(BTRIM(COALESCE(cat.proyecto, ''))),
           LOWER(BTRIM(COALESCE(cat.actividad, '')))
         ) THEN 0 ELSE 1 END, ruta.id_rutas_remision
         LIMIT 1
       ) apoyo_sugerido ON true
       WHERE cat.id_catalogo_actividades_vec = $1
         AND cat.tipo_registro = 'ACTIVIDAD'
       FOR SHARE OF cat`,
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
    if (actividad.subdivisionProgramas.length && !actividad.idEventoExistente) {
      if (!actividadCatalogada.programaBienestarCompleto || !actividadCatalogada.idTipoApoyoModalidad) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "La variable o modalidad seleccionada no tiene un tipo de apoyo activo asociado en el catálogo de Bienestar.",
        });
      }
      if (actividad.idTipoApoyo
        && String(actividad.idTipoApoyo) !== String(actividadCatalogada.idTipoApoyoModalidad)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "El tipo de apoyo seleccionado no corresponde a la variable o modalidad de esta actividad.",
        });
      }
      actividad.subdivisionProgramas = [actividadCatalogada.programaBienestarCompleto];
      actividad.idTipoApoyo = actividadCatalogada.idTipoApoyoModalidad;
      actividadCatalogada.modalidades = [{
        programaCompleto: actividadCatalogada.programaBienestarCompleto,
        idTipoApoyo: actividadCatalogada.idTipoApoyoModalidad,
      }];
    }
    if (actividad.idEventoExistente) {
      const { rows: eventoRows } = await client.query(
        `SELECT id_actividades_vec, variables_modalidades AS "variablesModalidades"
         FROM sat.actividades_vec
         WHERE id_actividades_vec = $1
           AND id_catalogo_actividades_vec = $2
           AND id_periodos_academicos = $3
           AND fecha_inicio = $4
           AND fecha_finalizacion = $5
           AND estado <> 'CANCELADA'
         FOR SHARE`,
        [
          actividad.idEventoExistente,
          actividad.idCatalogoActividad,
          actividad.idPeriodo,
          actividad.fechaInicio,
          actividad.fechaFinalizacion,
        ]
      );
      if (!eventoRows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "El evento seleccionado ya no está disponible. Actualiza la lista y selecciona una jornada próxima.",
        });
      }
      const variablesModalidades = eventoRows[0].variablesModalidades || [];
      if (variablesModalidades.length) {
        const seleccionadas = actividad.subdivisionProgramas;
        if (seleccionadas.length !== 1 || !variablesModalidades.includes(seleccionadas[0])) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "Selecciona una variable o modalidad disponible para esta actividad.",
          });
        }
        const { rows: apoyos } = await client.query(
          `SELECT modalidad.id_tipos_apoyo AS id
           FROM sat.actividades_vec_modalidades modalidad
           JOIN sat.apoyos_actividades_vec apoyo
             ON apoyo.id_tipos_apoyo = modalidad.id_tipos_apoyo
            AND apoyo.activo = true
           WHERE modalidad.id_actividades_vec = $1
             AND modalidad.programa = $2
             AND modalidad.id_tipos_apoyo IS NOT NULL
           LIMIT 1`,
          [actividad.idEventoExistente, seleccionadas[0]]
        );
        if (!apoyos[0]) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "La variable seleccionada no tiene un apoyo activo asociado.",
          });
        }
        if (String(actividad.idTipoApoyo || "") !== String(apoyos[0].id)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "El tipo de apoyo seleccionado no corresponde a la variable o modalidad del evento.",
          });
        }
      } else if (actividad.subdivisionProgramas.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "La actividad seleccionada no tiene variables o modalidades configuradas.",
        });
      }
    }
    if (actividad.idTipoApoyo && !actividad.subdivisionProgramas.length) {
      const apoyoPermitido = [
        actividadCatalogada.idTipoApoyoModalidad,
        actividadCatalogada.idTipoApoyoSugerido,
      ].some((id) => id && String(id) === String(actividad.idTipoApoyo));
      if (!apoyoPermitido) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "El tipo de apoyo seleccionado no está asociado a la actividad elegida.",
        });
      }
      const { rows: apoyosActivos } = await client.query(
        `SELECT id_tipos_apoyo AS id
         FROM sat.apoyos_actividades_vec
         WHERE id_tipos_apoyo = $1
           AND activo = true`,
        [actividad.idTipoApoyo]
      );
      if (!apoyosActivos[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El tipo de apoyo seleccionado no está activo." });
      }
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [participante.identificacion]);

    if (participante.tipo === "ESTUDIANTE") {
      if (!await existeEstudianteInstitucional(client, participante.identificacion)) {
        throw Object.assign(
          new Error("No se puede crear un estudiante desde este registro. Debe existir en la base institucional; para personas no encontradas elige Egresado, Colaborador o Externo."),
          { status: 409 },
        );
      }
    }

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
          apellidos.primero, apellidos.segundo, normalizarGeneroPersona(participante.genero),
          participante.fechaNacimiento, participante.correo, participante.correoInstitucional,
          participante.celular, participante.telefono
        ]
      );
      persona = rows[0] || await buscarPersonaPorIdentificacion(client, participante.identificacion);
    }
    if (!persona?.id) {
      throw Object.assign(new Error("No se pudo resolver la persona en la base de datos."), { status: 409 });
    }
    await vincularFuentesExistentes(client, persona.id, participante.identificacion);

    const rolesVerificados = await obtenerRolesVerificados(
      client,
      persona.id,
      participante.identificacion,
    );
    const { rows: perfilesDePersona } = await client.query(
      `SELECT tipo_participante AS rol
       FROM sat.participantes_vec
       WHERE id_personas = $1`,
      [persona.id]
    );
    const rolesExistentes = [...new Set([
      ...rolesVerificados,
      ...perfilesDePersona.map(({ rol }) => rol),
    ])];
    if (participante.tipo === "EXTERNO" && rolesExistentes.some((role) => role !== "EXTERNO")) {
      throw Object.assign(new Error("Externo es un rol exclusivo y no se puede combinar con otros roles."), { status: 409 });
    }
    if (participante.tipo !== "EXTERNO" && rolesExistentes.includes("EXTERNO")) {
      throw Object.assign(new Error("Esta persona tiene el rol Externo, que es exclusivo y no admite otros roles."), { status: 409 });
    }

    let idParticipante;
    const { rows: participantesExistentes } = await client.query(
      `SELECT id_participantes_vec
       FROM sat.participantes_vec
       WHERE id_personas = $1 AND tipo_participante = $2
       LIMIT 1`,
      [persona.id, participante.tipo]
    );
    if (!participantesExistentes[0]
      && !rolesExistentes.includes(participante.tipo)
      && rolesExistentes.length > 0
      && req.body.confirmarNuevoRol !== true) {
      throw Object.assign(new Error("Confirma explícitamente la asignación de este rol adicional antes de continuar."), {
        status: 409,
        code: "CONFIRM_ROLE_ADDITION",
      });
    }
    if (participantesExistentes[0]) {
      idParticipante = participantesExistentes[0].id_participantes_vec;
      await client.query(
        `UPDATE sat.participantes_vec
         SET tipo_documento = COALESCE(NULLIF(tipo_documento, ''), NULLIF($2, '')),
             detalle_tipo_participante = COALESCE(NULLIF(detalle_tipo_participante, ''), $15),
             codigo = COALESCE(NULLIF(codigo, ''), NULLIF($3, '')),
             programa_academico = COALESCE(NULLIF(programa_academico, ''), NULLIF($4, '')),
             programa_posgrado_dependencia = COALESCE(NULLIF(programa_posgrado_dependencia, ''), NULLIF($5, '')),
             semestre = COALESCE(semestre, $6),
             jornada = COALESCE(NULLIF(jornada, ''), NULLIF($7, '')),
             etnia = COALESCE(NULLIF(etnia, ''), NULLIF($8, '')),
             municipio = COALESCE(NULLIF(municipio, ''), NULLIF($9, '')),
             discapacidad = COALESCE(NULLIF(discapacidad, ''), NULLIF($10, '')),
             conflicto_armado = COALESCE(NULLIF(conflicto_armado, ''), NULLIF($11, '')),
             dependencia = COALESCE(NULLIF(dependencia, ''), NULLIF($12, '')),
             cargo = COALESCE(NULLIF(cargo, ''), NULLIF($13, '')),
             fecha_egreso = COALESCE(fecha_egreso, $14),
             actualizado_en = now()
         WHERE id_participantes_vec = $1`,
        [
          idParticipante, participante.tipoDocumento, participante.codigo,
          participante.programaAcademico, participante.programaPosgradoDependencia,
          participante.semestre, participante.jornada, participante.etnia,
          participante.municipio, participante.discapacidad, participante.conflictoArmado,
          participante.dependencia, participante.cargo, participante.fechaEgreso,
          participante.detalleTipoParticipante,
        ]
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO sat.participantes_vec (
           id_personas, tipo_participante, detalle_tipo_participante, tipo_documento, codigo,
           programa_academico, programa_posgrado_dependencia, semestre,
           jornada, etnia, municipio, discapacidad, conflicto_armado,
           dependencia, cargo, fecha_egreso
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id_participantes_vec`,
        [
          persona.id, participante.tipo, participante.detalleTipoParticipante, participante.tipoDocumento, participante.codigo,
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
    ].join(":");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sesionLock]);
    let idActividad = actividad.idEventoExistente;
    if (!idActividad) {
      const { rows: existingSessions } = await client.query(
        `SELECT id_actividades_vec
         FROM sat.actividades_vec
         WHERE id_catalogo_actividades_vec = $1
           AND id_periodos_academicos = $2
           AND fecha_inicio = $3
           AND fecha_finalizacion = $4
           AND estado <> 'CANCELADA'
         ORDER BY creado_en
         LIMIT 1
         FOR UPDATE`,
        [
          actividad.idCatalogoActividad,
          actividad.idPeriodo,
          actividad.fechaInicio,
          actividad.fechaFinalizacion,
        ]
      );
      idActividad = existingSessions[0]?.id_actividades_vec || null;
    }
    const { rowCount: yaVinculada } = await client.query(
      `SELECT 1
       FROM sat.actividades_vec_participantes avp
       JOIN sat.actividades_vec a
         ON a.id_actividades_vec = avp.id_actividades_vec
       JOIN sat.participantes_vec pv ON pv.id_participantes_vec = avp.id_participantes_vec
       WHERE pv.id_personas = $1
         AND a.id_catalogo_actividades_vec = $2
         AND a.id_periodos_academicos = $3
         AND a.fecha_inicio = $4
         AND a.fecha_finalizacion = $5
         AND pv.tipo_participante = $6
       LIMIT 1`,
      [
        persona.id,
        actividad.idCatalogoActividad,
        actividad.idPeriodo,
        actividad.fechaInicio,
        actividad.fechaFinalizacion,
        participante.tipo,
      ]
    );
    if (yaVinculada) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "La persona ya está vinculada a esta actividad en esas fechas, con otro rol o tipo de apoyo.",
      });
    }

    if (!idActividad) {
      const actividadCreada = await insertarActividadTransaccion(
        client,
        actividad,
        actividadCatalogada,
        req.user?.id
      );
      idActividad = actividadCreada.id;
    }

    const { rows: registro } = await client.query(
      `INSERT INTO sat.actividades_vec_participantes (
         id_actividades_vec, id_participantes_vec, id_tipos_apoyo, programa_modalidad
       ) VALUES ($1, $2, $3, $4)
       RETURNING id_actividades_vec_participantes`,
      [
        idActividad,
        idParticipante,
        actividad.idTipoApoyo,
        actividad.subdivisionProgramas[0] || null,
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
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      });
    }
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

    if (payload.tipo === "ESTUDIANTE"
      && !await existeEstudianteInstitucional(client, payload.identificacion)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "No se puede crear un perfil de estudiante si no existe en la base institucional. Para personas no encontradas, usa Egresado, Colaborador o Externo.",
      });
    }

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
          apellidos.primero, apellidos.segundo, normalizarGeneroPersona(payload.genero),
          payload.fechaNacimiento, payload.correo, payload.correoInstitucional,
          payload.celular, payload.telefono
        ]
      );
      persona = rows[0] || await buscarPersonaPorIdentificacion(client, payload.identificacion);
    }

    if (!persona?.id) {
      throw Object.assign(new Error("No se pudo resolver la persona en la base de datos."), { status: 409 });
    }
    await vincularFuentesExistentes(client, persona.id, payload.identificacion);

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
         id_personas, tipo_participante, detalle_tipo_participante, tipo_documento, codigo,
         programa_academico, programa_posgrado_dependencia, semestre,
         jornada, dependencia, cargo, fecha_egreso, etnia, municipio,
         discapacidad, conflicto_armado
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )
       RETURNING id_participantes_vec`,
      [
        persona.id, payload.tipo, payload.detalleTipoParticipante, payload.tipoDocumento, payload.codigo,
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
         COALESCE(e.genero, per.genero) AS genero,
         COALESCE(e.fecha_nacimiento, per.fecha_nacimiento) AS "fechaNacimiento",
         COALESCE(e.correo_institucional, e.correo_personal,
                  per.correo_institucional, per.correo_electronico,
                  per.correo_electronico_opcional) AS correo,
         COALESCE(per.celular, per.telefono, e.telefono, e.telefono_fijo) AS contacto,
         COALESCE(e.etnia, pv.etnia) AS etnia,
         pv.municipio,
         COALESCE(per.victima_conflicto, pv.conflicto_armado) AS "conflictoArmado",
         pv.discapacidad,
         pv.fecha_egreso AS "fechaEgreso",
         pv.tipo_participante AS "tipoRegistrado",
         pv.detalle_tipo_participante AS "detalleTipoParticipante",
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
         COALESCE(per.correo_institucional, u.correo_institucional,
                  per.correo_electronico, per.correo_electronico_opcional) AS correo,
         COALESCE(per.celular, per.telefono) AS contacto,
         pv.etnia,
         pv.municipio,
         pv.discapacidad,
         pv.conflicto_armado AS "conflictoArmado",
         pv.fecha_egreso AS "fechaEgreso",
         pv.tipo_participante AS "tipoRegistrado",
         pv.detalle_tipo_participante AS "detalleTipoParticipante",
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
         AND (
           EXISTS (
             SELECT 1
             FROM sat.usuarios_roles ur
             JOIN sat.roles rol ON rol.id_roles = ur.id_roles
             WHERE ur.id_usuarios = u.id_usuarios
               AND UPPER(BTRIM(rol.nombre)) IN (
                 'ADMIN', 'ADMINISTRADOR', 'COLABORADOR', 'DIRECTIVO', 'DOCENTE', 'PROFESIONAL'
               )
           )
           OR EXISTS (
             SELECT 1 FROM sat.docentes d
             WHERE d.id_usuarios = u.id_usuarios AND d.activo = true
           )
         )
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
              COALESCE(p.correo_institucional, p.correo_electronico,
                       p.correo_electronico_opcional) AS correo,
              COALESCE(p.celular, p.telefono) AS contacto,
              pv.etnia, pv.municipio, pv.discapacidad,
              pv.conflicto_armado AS "conflictoArmado", pv.fecha_egreso AS "fechaEgreso",
              pv.tipo_participante AS "tipoRegistrado",
              pv.detalle_tipo_participante AS "detalleTipoParticipante",
              (pv.id_participantes_vec IS NOT NULL) AS "yaRegistrado"
       FROM sat.personas p
       LEFT JOIN sat.participantes_vec pv
         ON pv.id_personas = p.id
        AND pv.tipo_participante = $2
       WHERE p.numero_identificacion = $1
         AND pv.id_participantes_vec IS NOT NULL
       LIMIT 1`,
      [identificacion, tipo]
    );
    if (rows[0]) return mapearParticipante(rows[0], "sat.personas");
  }
  return null;
}

async function buscarIdentidadPorIdentificador(identificador) {
  const { rows } = await query(
    `SELECT id_persona AS "idPersona", identificacion
     FROM (
       SELECT p.id AS id_persona, p.numero_identificacion AS identificacion
       FROM sat.personas p
       WHERE p.numero_identificacion = $1
       UNION
       SELECT e.id_personas, COALESCE(p.numero_identificacion, e.numero_documento)
       FROM sat.estudiantes e
       LEFT JOIN sat.personas p ON p.id = e.id_personas
       WHERE e.numero_documento = $1
          OR e.codigo_externo = $1
          OR EXISTS (
            SELECT 1 FROM sat.matriculas m
            WHERE m.id_estudiantes = e.id_estudiantes AND m.codigo_externo = $1
          )
       UNION
       SELECT pv.id_personas, p.numero_identificacion
       FROM sat.participantes_vec pv
       JOIN sat.personas p ON p.id = pv.id_personas
       WHERE pv.codigo = $1
       UNION
       SELECT u.id_personas, COALESCE(p.numero_identificacion, u.numero_documento)
       FROM sat.usuarios u
       LEFT JOIN sat.personas p ON p.id = u.id_personas
       WHERE u.numero_documento = $1
         AND u.activo = true AND u.eliminado_en IS NULL
     ) identities
     WHERE identificacion IS NOT NULL
     ORDER BY id_persona NULLS LAST
     `,
    [identificador]
  );
  return rows;
}

async function obtenerRolesParticipante(db, idPersona, identificacion) {
  const roles = new Set(await obtenerRolesVerificados(db, idPersona, identificacion));
  const ejecutarQuery = typeof db === "function" ? db : db.query.bind(db);
  const { rows } = await ejecutarQuery(
    `SELECT DISTINCT pv.tipo_participante AS rol
     FROM sat.participantes_vec pv
     JOIN sat.personas p ON p.id = pv.id_personas
     WHERE ($1::bigint IS NOT NULL AND p.id = $1::bigint)
        OR p.numero_identificacion = $2`,
    [idPersona || null, identificacion]
  );
  rows.forEach((row) => roles.add(row.rol));
  return [...roles].sort();
}

/** Roles institucionales comprobados directamente en las fuentes del SAT. */
async function obtenerRolesVerificados(db, idPersona, identificacion) {
  const ejecutarQuery = typeof db === "function" ? db : db.query.bind(db);
  const { rows } = await ejecutarQuery(
    `SELECT 'ESTUDIANTE' AS rol
     WHERE EXISTS (
       SELECT 1
       FROM sat.estudiantes e
       WHERE ($1::bigint IS NOT NULL AND e.id_personas = $1::bigint)
          OR e.numero_documento = $2
          OR e.codigo_externo = $2
          OR EXISTS (
            SELECT 1 FROM sat.matriculas m
            WHERE m.id_estudiantes = e.id_estudiantes
              AND m.codigo_externo = $2
          )
     )
     UNION
     SELECT 'COLABORADOR' AS rol
     WHERE EXISTS (
       SELECT 1
       FROM sat.usuarios u
       WHERE (($1::bigint IS NOT NULL AND u.id_personas = $1::bigint)
              OR u.numero_documento = $2)
         AND u.activo = true
         AND u.eliminado_en IS NULL
         AND (
           EXISTS (
             SELECT 1
             FROM sat.usuarios_roles ur
             JOIN sat.roles r ON r.id_roles = ur.id_roles
             WHERE ur.id_usuarios = u.id_usuarios
               AND r.activo = true
               AND UPPER(BTRIM(r.nombre)) IN (
                 'ADMIN', 'ADMINISTRADOR', 'COLABORADOR', 'DIRECTIVO', 'DOCENTE', 'PROFESIONAL'
               )
           )
           OR EXISTS (
             SELECT 1 FROM sat.docentes d
             WHERE d.id_usuarios = u.id_usuarios AND d.activo = true
           )
         )
     )
     OR EXISTS (
       SELECT 1
       FROM sat.docentes d
       WHERE d.activo = true
         AND (($1::bigint IS NOT NULL AND d.id_personas = $1::bigint)
              OR d.numero_documento = $2)
     )
     ORDER BY rol`,
    [idPersona || null, identificacion],
  );
  return rows.map((row) => row.rol);
}

async function buscarParticipanteEnPersonas(tipo, identificacion) {
  const { rows } = await query(
    `SELECT
       p.id AS "idPersona",
       $2::text AS tipo,
       p.numero_identificacion AS identificacion,
       COALESCE(e.tipo_documento, u.tipo_documento, pv.tipo_documento) AS "tipoDocumento",
       COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre)), ''), u.nombres) AS nombres,
       COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido)), ''), u.apellidos) AS apellidos,
       COALESCE(e.codigo_externo, m.codigo_externo, pv.codigo, d.codigo_externo) AS codigo,
       COALESCE(prog.nombre, pv.programa_academico) AS "programaAcademico",
       pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
       COALESCE(m.semestre, e.semestre_actual, pv.semestre) AS semestre,
       COALESCE(m.jornada, pv.jornada) AS jornada,
       periodo.nombre AS periodo,
       pv.dependencia,
       COALESCE(p.cargo, pv.cargo) AS cargo,
       COALESCE(e.genero, p.genero) AS genero,
       COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) AS "fechaNacimiento",
       COALESCE(e.correo_institucional, e.correo_personal,
                p.correo_institucional, p.correo_electronico,
                p.correo_electronico_opcional, u.correo_institucional) AS correo,
       COALESCE(p.celular, p.telefono, e.telefono, e.telefono_fijo, u.telefono) AS contacto,
       COALESCE(e.etnia, pv.etnia) AS etnia,
       pv.municipio,
       COALESCE(p.victima_conflicto::text, pv.conflicto_armado) AS "conflictoArmado",
       pv.discapacidad,
       pv.fecha_egreso AS "fechaEgreso",
       pv.tipo_participante AS "tipoRegistrado",
       pv.detalle_tipo_participante AS "detalleTipoParticipante",
       (pv.tipo_participante = $2) AS "yaRegistrado"
     FROM sat.personas p
     LEFT JOIN LATERAL (
       SELECT e.*
       FROM sat.estudiantes e
       WHERE e.id_personas = p.id OR e.numero_documento = p.numero_identificacion
       ORDER BY (e.id_personas = p.id) DESC NULLS LAST, e.id_estudiantes
       LIMIT 1
     ) e ON TRUE
     LEFT JOIN LATERAL (
       SELECT m.*
       FROM sat.matriculas m
       WHERE m.id_estudiantes = e.id_estudiantes
       ORDER BY (UPPER(COALESCE(m.estado, '')) = 'ACTIVA') DESC, m.id_matriculas DESC
       LIMIT 1
     ) m ON TRUE
     LEFT JOIN LATERAL (
       SELECT pv.*
       FROM sat.participantes_vec pv
       WHERE pv.id_personas = p.id
       ORDER BY (pv.tipo_participante = $2) DESC,
                (pv.tipo_participante = 'ESTUDIANTE') DESC,
                pv.creado_en DESC
       LIMIT 1
     ) pv ON TRUE
     LEFT JOIN LATERAL (
       SELECT u.*
       FROM sat.usuarios u
       WHERE (u.id_personas = p.id OR u.numero_documento = p.numero_identificacion)
         AND u.activo = true AND u.eliminado_en IS NULL
       ORDER BY u.id_usuarios
       LIMIT 1
     ) u ON TRUE
     LEFT JOIN LATERAL (
       SELECT d.*
       FROM sat.docentes d
       WHERE d.id_usuarios = u.id_usuarios
          OR d.id_personas = p.id
          OR d.numero_documento = p.numero_identificacion
       ORDER BY d.activo DESC, d.id_docentes
       LIMIT 1
     ) d ON TRUE
     LEFT JOIN sat.programas_academicos prog
       ON prog.id_programas_academicos = COALESCE(
         m.id_programas_academicos, e.id_programas_academicos, d.id_programas_academicos
       )
     LEFT JOIN sat.periodos_academicos periodo
       ON periodo.id_periodos_academicos = m.id_periodos_academicos
     WHERE p.numero_identificacion = $1
     LIMIT 1`,
    [identificacion, tipo]
  );
  return rows[0] ? mapearParticipante(rows[0], "sat.personas") : null;
}

async function buscarDatosComplementariosPersona(idPersona) {
  if (!idPersona) return {};
  const { rows } = await query(
    `SELECT
       COALESCE(e.tipo_documento, pv.tipo_documento) AS "tipoDocumento",
       COALESCE(e.codigo_externo, m.codigo_externo, pv.codigo, d.codigo_externo) AS codigo,
       COALESCE(prog.nombre, pv.programa_academico) AS "programaAcademico",
       pv.programa_posgrado_dependencia AS "programaPosgradoDependencia",
       COALESCE(m.semestre, e.semestre_actual, pv.semestre) AS semestre,
       COALESCE(m.jornada, pv.jornada) AS jornada,
       periodo.nombre AS periodo,
       pv.dependencia,
       COALESCE(p.cargo, pv.cargo) AS cargo,
       COALESCE(e.genero, p.genero) AS genero,
       COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) AS "fechaNacimiento",
       COALESCE(e.correo_institucional, e.correo_personal,
                p.correo_institucional, p.correo_electronico,
                p.correo_electronico_opcional, u.correo_institucional) AS correo,
       COALESCE(p.celular, p.telefono, e.telefono, e.telefono_fijo) AS contacto,
       COALESCE(e.etnia, pv.etnia) AS etnia,
       pv.municipio,
       COALESCE(p.victima_conflicto::text, pv.conflicto_armado) AS "conflictoArmado",
       pv.discapacidad,
       pv.fecha_egreso AS "fechaEgreso"
     FROM sat.personas p
     LEFT JOIN LATERAL (
       SELECT e.*
       FROM sat.estudiantes e
       WHERE e.id_personas = p.id OR e.numero_documento = p.numero_identificacion
       ORDER BY (e.id_personas = p.id) DESC NULLS LAST, e.id_estudiantes
       LIMIT 1
     ) e ON TRUE
     LEFT JOIN LATERAL (
       SELECT m.*
       FROM sat.matriculas m
       WHERE m.id_estudiantes = e.id_estudiantes
       ORDER BY (UPPER(COALESCE(m.estado, '')) = 'ACTIVA') DESC,
                m.id_matriculas DESC
       LIMIT 1
     ) m ON TRUE
     LEFT JOIN sat.programas_academicos prog
       ON prog.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
     LEFT JOIN sat.periodos_academicos periodo
       ON periodo.id_periodos_academicos = m.id_periodos_academicos
     LEFT JOIN LATERAL (
       SELECT pv.*
       FROM sat.participantes_vec pv
       WHERE pv.id_personas = p.id
       ORDER BY (pv.tipo_participante = 'ESTUDIANTE') DESC, pv.creado_en DESC
       LIMIT 1
     ) pv ON TRUE
     LEFT JOIN LATERAL (
       SELECT u.*
       FROM sat.usuarios u
       WHERE (u.id_personas = p.id OR u.numero_documento = p.numero_identificacion)
         AND u.activo = true
         AND u.eliminado_en IS NULL
       ORDER BY u.id_usuarios
       LIMIT 1
     ) u ON TRUE
     LEFT JOIN LATERAL (
       SELECT d.*
       FROM sat.docentes d
       WHERE d.id_usuarios = u.id_usuarios
          OR d.id_personas = p.id
          OR d.numero_documento = p.numero_identificacion
       ORDER BY d.activo DESC, d.id_docentes
       LIMIT 1
     ) d ON TRUE
     WHERE p.id = $1
     LIMIT 1`,
    [idPersona]
  );
  return rows[0] || {};
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

async function existeEstudianteInstitucional(client, identificacion) {
  const executeQuery = typeof client === "function"
    ? client
    : client.query.bind(client);
  const { rows } = await executeQuery(
    `SELECT EXISTS (
       SELECT 1
       FROM sat.estudiantes e
       LEFT JOIN sat.personas p ON p.id = e.id_personas
       WHERE e.numero_documento = $1
          OR e.codigo_externo = $1
          OR p.numero_identificacion = $1
       UNION ALL
       SELECT 1
       FROM sat.matriculas m
       JOIN sat.estudiantes e ON e.id_estudiantes = m.id_estudiantes
       WHERE m.codigo_externo = $1
       UNION ALL
       SELECT 1
       FROM sat.participantes_vec pv
       JOIN sat.personas vec_person ON vec_person.id = pv.id_personas
       WHERE pv.tipo_participante = 'ESTUDIANTE'
         AND vec_person.numero_identificacion = $1
     ) AS existe`,
    [identificacion]
  );
  return rows[0].existe;
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
     ON CONFLICT (numero_identificacion) DO NOTHING
     RETURNING id`,
    [
      identificacion, nombres.primero, nombres.segundo,
      apellidos.primero, apellidos.segundo,
      perfil.genero ? normalizarGeneroPersona(perfil.genero) : null, perfil.fecha_nacimiento || null,
      perfil.correo_institucional || null, perfil.telefono_fijo || perfil.telefono || null,
      perfil.telefono || null
    ]
  );
  const idPersona = rows[0]?.id
    || (await buscarPersonaPorIdentificacion(client, identificacion))?.id;
  if (!idPersona) return null;
  await client.query(
    `UPDATE sat.estudiantes SET id_personas=$1
     WHERE numero_documento=$2 AND id_personas IS NULL`,
    [idPersona, identificacion]
  );
  await client.query(
    `UPDATE sat.usuarios SET id_personas=$1
     WHERE numero_documento=$2 AND id_personas IS NULL`,
    [idPersona, identificacion]
  );
  await client.query(
    `UPDATE sat.docentes SET id_personas=$1
     WHERE numero_documento=$2 AND id_personas IS NULL`,
    [idPersona, identificacion]
  );
  return { id: idPersona, identificacion };
}

function normalizarEntrada(body = {}) {
  const clean = (value) => value == null ? null : String(value).trim() || null;
  return {
    tipo: clean(body.tipo)?.toUpperCase(),
    detalleTipoParticipante: clean(body.detalleTipoParticipante),
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
    direccion: clean(body.direccion),
    genero: clean(body.genero),
    lugarNacimiento: clean(body.lugarNacimiento),
    etnia: clean(body.etnia),
    municipio: clean(body.municipio),
    discapacidad: clean(body.discapacidad),
    conflictoArmado: clean(body.conflictoArmado)
  };
}

function normalizarGeneroPersona(genero) {
  const valor = String(genero ?? "").trim();
  const clave = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase();
  const codigos = {
    F: "F",
    FEMENINO: "F",
    MUJER: "F",
    M: "M",
    MASCULINO: "M",
    HOMBRE: "M",
    NB: "NB",
    NOBINARIO: "NB",
    O: "O",
    OT: "OT",
    OTRO: "OT",
    OTRA: "OT",
    NR: "NR",
    PREFIERONORESPONDER: "NR",
    PREFIERENORESPONDER: "NR",
    NORESPONDER: "NR",
  };
  const codigo = codigos[clave];
  if (codigo) return codigo;
  if (valor.length <= 2) return valor || null;
  throw Object.assign(
    new Error("El género indicado no tiene un código compatible con la base de datos."),
    { status: 400 },
  );
}

function normalizarActividad(body = {}) {
  const clean = (value) => value == null ? null : String(value).trim() || null;
  const subdivisionProgramas = Array.isArray(body.subdivisionProgramas)
    ? [...new Set(body.subdivisionProgramas.map(clean).filter(Boolean))]
    : (clean(body.subdivisionPrograma) ? [clean(body.subdivisionPrograma)] : []);
  const alianza = body.alianzaInterinstitucional;
  return {
    idEventoExistente: clean(body.idEventoExistente),
    idPeriodo: clean(body.idPeriodo),
    idCatalogoActividad: clean(body.idCatalogoActividad),
    nombreActividad: clean(body.actividad),
    programaBienestar: clean(body.programaBienestar),
    subdivisionProgramas,
    descripcion: clean(body.descripcion),
    tipoOtra: clean(body.tipoActividadOtra),
    alianza: alianza === true || alianza === "true"
      ? true
      : alianza === false || alianza === "false" ? false : null,
    entidadAlianza: clean(body.entidadAlianza),
    articulacion: clean(body.articulacionInstitucional),
    idDependencia: clean(body.idDependencia),
    dependenciaOtra: clean(body.dependenciaOtra),
    modalidad: clean(body.modalidad),
    ubicacion: clean(body.ubicacion),
    fechaInicio: clean(body.fechaInicio),
    fechaFinalizacion: clean(body.fechaFinalizacion),
    idTipoApoyo: clean(body.idTipoApoyo),
    estrategiaBienestar: clean(body.estrategiaPoliticaBienestar),
    estrategiaPermanencia: clean(body.estrategiaPoliticaPermanencia),
    estrategiaInclusiva: clean(body.estrategiaPoliticaEducacionInclusiva)
  };
}

function validarActividad(actividad, { requiereNombre = false } = {}) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const esFechaValida = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!actividad.idPeriodo || !uuidPattern.test(actividad.idPeriodo)) return "Selecciona un periodo académico válido.";
  if (requiereNombre) {
    if (!actividad.nombreActividad) return "Ingresa el nombre de la actividad.";
    if (actividad.nombreActividad.length > 250) return "El nombre de la actividad no puede superar 250 caracteres.";
    if (!UBICACIONES_ACTIVIDAD.has(actividad.ubicacion)) return "Selecciona uno de los campus disponibles.";
    if (actividad.programaBienestar?.length > 250) return "El nombre del programa de Bienestar supera el límite permitido.";
    if (actividad.subdivisionProgramas.some((nombre) => nombre.length > 250)) return "El nombre de una variable o modalidad supera el límite permitido.";
    if (actividad.subdivisionProgramas.length && !actividad.programaBienestar) return "Selecciona el programa general de Bienestar.";
  } else if (!actividad.idCatalogoActividad || !uuidPattern.test(actividad.idCatalogoActividad)) {
    return "Selecciona una actividad del catálogo institucional.";
  }
  if (actividad.idEventoExistente && !uuidPattern.test(actividad.idEventoExistente)) {
    return "Selecciona un evento próximo válido.";
  }
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

function fechaActualLocalISO() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function validarEntrada(payload) {
  if (!TIPOS.has(payload.tipo)) return "Selecciona un tipo de participante válido.";
  if (!payload.identificacion || payload.identificacion.length > MAX_IDENTIFICACION_LENGTH) {
    return "La identificación es obligatoria y debe tener máximo 64 caracteres.";
  }
  if (!payload.nombres || !payload.apellidos) return "Nombres y apellidos son obligatorios.";
  const detallesPorTipo = {
    ESTUDIANTE: ["Estudiante"],
  };
  if (payload.detalleTipoParticipante?.length > 120) {
    return "La clasificación del participante no puede superar 120 caracteres.";
  }
  if (payload.tipo === "ESTUDIANTE"
    && payload.detalleTipoParticipante
    && !detallesPorTipo[payload.tipo].includes(payload.detalleTipoParticipante)) {
    return "Selecciona una clasificación válida para el tipo de participante.";
  }
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
    detalleTipoParticipante: row.detalleTipoParticipante || (row.tipo === "ESTUDIANTE" ? "Estudiante" : ""),
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
    return { error: "Selecciona una actividad registrada válida." };
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
    return res.status(503).json({
      error: "Faltan aplicar las migraciones del módulo Actividades en server/src/features/actividades/ antes de continuar."
    });
  }
  if (err.code === "42703" && /asistencia_verificada/.test(err.message)) {
    return res.status(503).json({
      error: "Para consultar o guardar la verificación de asistencia, aplica server/src/features/actividades/verificacion_elegibilidad.sql sobre la base SAT."
    });
  }
  next(err);
}

export default router;
