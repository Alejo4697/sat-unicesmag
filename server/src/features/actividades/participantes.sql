-- Estructura propia para registrar las personas utilizadas por Actividades VEC.
-- Reutiliza sat.personas; no duplica nombres, identificaciones o contacto.
-- Aplicar una vez en la base configurada para SAT.

BEGIN;

CREATE TABLE IF NOT EXISTS sat.participantes_vec (
  id_participantes_vec uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_personas bigint NOT NULL REFERENCES sat.personas(id) ON DELETE RESTRICT,
  tipo_participante varchar(20) NOT NULL
    CHECK (tipo_participante IN ('ESTUDIANTE', 'COLABORADOR', 'EGRESADO', 'EXTERNO')),
  tipo_documento varchar(50),
  codigo varchar(100),
  programa_academico varchar(250),
  programa_posgrado_dependencia varchar(250),
  semestre smallint CHECK (semestre IS NULL OR semestre > 0),
  jornada varchar(100),
  dependencia varchar(250),
  cargo varchar(250),
  fecha_egreso date,
  lugar_nacimiento varchar(250),
  etnia varchar(150),
  municipio varchar(150),
  discapacidad text,
  conflicto_armado text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_participantes_vec_persona_tipo UNIQUE (id_personas, tipo_participante)
);

CREATE INDEX IF NOT EXISTS idx_participantes_vec_tipo_persona
  ON sat.participantes_vec (tipo_participante, id_personas);

COMMIT;



Create index if not exists para poder confimar todo 