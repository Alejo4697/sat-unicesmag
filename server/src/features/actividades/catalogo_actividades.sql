-- Catálogo exacto de actividades extraído del Excel institucional.
-- Una fila corresponde a una fila de origen no vacía; las notas se conservan,
-- pero no se ofrecen como opciones de actividad.

BEGIN;

CREATE TABLE IF NOT EXISTS sat.catalogo_actividades_vec (
  id_catalogo_actividades_vec uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_origen varchar(100) NOT NULL,
  fila_origen integer NOT NULL CHECK (fila_origen > 1),
  tipo_registro varchar(12) NOT NULL
    CHECK (tipo_registro IN ('ACTIVIDAD', 'NOTA')),
  actividad text,
  nota_origen text,
  descripcion text,
  tipo_actividad varchar(200),
  proyecto text,
  programa text,
  componente text,
  linea_accion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalogo_actividades_vec_origen UNIQUE (hoja_origen, fila_origen),
  CONSTRAINT catalogo_actividades_vec_tipo_contenido_check CHECK (
    (tipo_registro = 'ACTIVIDAD' AND NULLIF(BTRIM(actividad), '') IS NOT NULL AND nota_origen IS NULL)
    OR
    (tipo_registro = 'NOTA' AND NULLIF(BTRIM(nota_origen), '') IS NOT NULL AND actividad IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_catalogo_actividades_vec_cascada
  ON sat.catalogo_actividades_vec
  (linea_accion, componente, programa, proyecto)
  WHERE tipo_registro = 'ACTIVIDAD';

CREATE INDEX IF NOT EXISTS idx_catalogo_actividades_vec_actividad
  ON sat.catalogo_actividades_vec (LOWER(actividad))
  WHERE tipo_registro = 'ACTIVIDAD';

ALTER TABLE sat.actividades_vec
  ADD COLUMN IF NOT EXISTS id_catalogo_actividades_vec uuid
  REFERENCES sat.catalogo_actividades_vec (id_catalogo_actividades_vec);

ALTER TABLE sat.actividades_vec
  ALTER COLUMN id_programas_bienestar DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'sat.actividades_vec'::regclass
      AND conname = 'actividades_vec_catalogo_o_programa_check'
  ) THEN
    ALTER TABLE sat.actividades_vec
      ADD CONSTRAINT actividades_vec_catalogo_o_programa_check
      CHECK (
        id_catalogo_actividades_vec IS NOT NULL
        OR id_programas_bienestar IS NOT NULL
      );
  END IF;
END $$;

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
  prog_acad.nombre AS programa_academico_pregrado,
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
  COALESCE(cat.actividad, a.actividad)::varchar(250) AS actividad,
  COALESCE(cat.descripcion, a.descripcion_actividad) AS descripcion_actividad,
  COALESCE(cat.proyecto, a.proyecto)::varchar(250) AS proyecto,
  COALESCE(cat.tipo_actividad, a.tipo_actividad)::varchar(150) AS tipo_actividad,
  a.tipo_actividad_otra,
  a.alianza_interinstitucional,
  a.entidad_alianza,
  a.articulacion_institucional,
  d.nombre AS dependencia,
  a.dependencia_otra,
  a.modalidad,
  a.fecha_inicio,
  a.fecha_finalizacion,
  COALESCE(cat.programa, pb.nombre)::varchar(200) AS programa_bienestar,
  COALESCE(cat.componente, cb.nombre)::varchar(150) AS componente,
  COALESCE(cat.linea_accion, la.nombre)::varchar(150) AS linea_accion_area,
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
LEFT JOIN sat.programas_academicos prog_acad
  ON prog_acad.id_programas_academicos = COALESCE(m.id_programas_academicos, e.id_programas_academicos)
LEFT JOIN sat.dependencias d ON d.id_dependencias = a.id_dependencias
LEFT JOIN sat.programas_bienestar pb
  ON pb.id_programas_bienestar = a.id_programas_bienestar
LEFT JOIN sat.componentes_bienestar cb
  ON cb.id_componentes_bienestar = pb.id_componentes_bienestar
LEFT JOIN sat.lineas_accion la ON la.id_lineas_accion = cb.id_lineas_accion
LEFT JOIN sat.apoyos_actividades_vec ta ON ta.id_tipos_apoyo = avp.id_tipos_apoyo;

COMMIT;
