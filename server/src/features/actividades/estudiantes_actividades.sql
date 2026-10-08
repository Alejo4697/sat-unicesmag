-- Registro relacional de actividades VEC con estudiantes.
-- Los datos de identidad y matrícula se consultan desde sus fuentes SAT;
-- la actividad y su vínculo con el participante se guardan por separado.

BEGIN;

CREATE TABLE IF NOT EXISTS sat.actividades_vec (
  id_actividades_vec uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_periodos_academicos uuid NOT NULL
    REFERENCES sat.periodos_academicos(id_periodos_academicos),
  actividad varchar(250) NOT NULL,
  descripcion_actividad text,
  proyecto varchar(250) NOT NULL,
  tipo_actividad varchar(150),
  tipo_actividad_otra text,
  alianza_interinstitucional boolean,
  entidad_alianza varchar(250),
  articulacion_institucional varchar(250),
  id_dependencias uuid REFERENCES sat.dependencias(id_dependencias),
  dependencia_otra varchar(250),
  modalidad varchar(100),
  fecha_inicio date NOT NULL,
  fecha_finalizacion date NOT NULL,
  id_programas_bienestar uuid NOT NULL
    REFERENCES sat.programas_bienestar(id_programas_bienestar),
  estrategia_politica_bienestar text,
  estrategia_politica_permanencia text,
  estrategia_politica_educacion_inclusiva text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actividades_vec_fechas_validas
    CHECK (fecha_finalizacion >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS sat.actividades_vec_participantes (
  id_actividades_vec_participantes uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_actividades_vec uuid NOT NULL
    REFERENCES sat.actividades_vec(id_actividades_vec) ON DELETE CASCADE,
  id_participantes_vec uuid NOT NULL
    REFERENCES sat.participantes_vec(id_participantes_vec) ON DELETE RESTRICT,
  id_tipos_apoyo uuid REFERENCES sat.tipos_apoyo(id_tipos_apoyo),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_actividades_vec_participante
    UNIQUE (id_actividades_vec, id_participantes_vec)
);

CREATE INDEX IF NOT EXISTS idx_actividades_vec_periodo_fecha
  ON sat.actividades_vec (id_periodos_academicos, fecha_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_actividades_vec_participante
  ON sat.actividades_vec_participantes (id_participantes_vec);

CREATE OR REPLACE VIEW sat.vw_actividades_vec_estudiantes AS
SELECT
  pa.nombre AS periodo,
  COALESCE(p.numero_identificacion, e.numero_documento) AS identificacion,
  e.tipo_documento AS tipo_identificacion,
  COALESCE(m.codigo_externo, e.codigo_externo) AS codigo,
  COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' ', p.primer_apellido, p.segundo_apellido,
                           p.primer_nombre, p.segundo_nombre)), ''),
    NULLIF(BTRIM(CONCAT_WS(' ', e.apellidos, e.nombres)), '')
  ) AS apellidos_y_nombres,
  prog.nombre AS programa_academico_pregrado,
  pv.programa_posgrado_dependencia AS programa_academico_posgrado,
  COALESCE(m.semestre, e.semestre_actual, pv.semestre) AS semestre,
  COALESCE(e.genero, p.genero) AS genero,
  m.jornada,
  COALESCE(e.correo_institucional, e.correo_personal,
           p.correo_institucional, p.correo_electronico) AS correo,
  COALESCE(e.telefono, e.telefono_fijo, p.celular, p.telefono) AS contacto,
  pv.tipo_participante AS tipo_usuario_participante,
  CASE WHEN COALESCE(e.fecha_nacimiento, p.fecha_nacimiento) IS NULL THEN NULL
       ELSE DATE_PART('year', AGE(CURRENT_DATE, COALESCE(e.fecha_nacimiento, p.fecha_nacimiento)))::int
  END AS edad,
  COALESCE(e.etnia, pv.etnia) AS etnia,
  pv.municipio,
  COALESCE(p.victima_conflicto, pv.conflicto_armado) AS conflicto_armado,
  pv.discapacidad,
  a.actividad,
  a.descripcion_actividad,
  a.proyecto,
  a.tipo_actividad,
  a.tipo_actividad_otra,
  a.alianza_interinstitucional,
  a.entidad_alianza,
  a.articulacion_institucional,
  d.nombre AS dependencia,
  a.dependencia_otra,
  a.modalidad,
  a.fecha_inicio,
  a.fecha_finalizacion,
  pb.nombre AS programa_bienestar,
  cb.nombre AS componente,
  la.nombre AS linea_accion_area,
  a.estrategia_politica_bienestar,
  a.estrategia_politica_permanencia,
  a.estrategia_politica_educacion_inclusiva,
  ta.nombre AS tipo_apoyo
FROM sat.actividades_vec a
JOIN sat.periodos_academicos pa
  ON pa.id_periodos_academicos = a.id_periodos_academicos
JOIN sat.actividades_vec_participantes avp
  ON avp.id_actividades_vec = a.id_actividades_vec
JOIN sat.participantes_vec pv
  ON pv.id_participantes_vec = avp.id_participantes_vec
 AND pv.tipo_participante = 'ESTUDIANTE'
JOIN sat.personas p ON p.id = pv.id_personas
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
JOIN sat.programas_bienestar pb ON pb.id_programas_bienestar = a.id_programas_bienestar
JOIN sat.componentes_bienestar cb ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
JOIN sat.lineas_accion la ON la.id_lineas_accion = cb.id_lineas_accion
LEFT JOIN sat.tipos_apoyo ta ON ta.id_tipos_apoyo = avp.id_tipos_apoyo;

COMMIT;
