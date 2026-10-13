-- Extiende jornadas VEC existentes para permitir administración de estado.
-- No reemplaza ni duplica las tablas del módulo.
BEGIN;

ALTER TABLE sat.actividades_vec
  ADD COLUMN IF NOT EXISTS estado varchar(20) NOT NULL DEFAULT 'PROGRAMADA',
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ubicacion text;

ALTER TABLE sat.participantes_vec
  ADD COLUMN IF NOT EXISTS detalle_tipo_participante varchar(120);

CREATE TABLE IF NOT EXISTS sat.catalogo_bienestar_actividades (
  programa varchar(250) PRIMARY KEY,
  componente varchar(250),
  linea_accion varchar(250),
  estrategia_politica_bienestar text,
  estrategia_politica_permanencia text,
  estrategia_politica_educacion_inclusiva text,
  numero_tipo_apoyo smallint,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sat.actividades_vec'::regclass
      AND conname = 'actividades_vec_estado_check'
  ) THEN
    ALTER TABLE sat.actividades_vec
      ADD CONSTRAINT actividades_vec_estado_check
      CHECK (estado IN ('PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_actividades_vec_estado_fecha
  ON sat.actividades_vec (estado, fecha_inicio DESC);

CREATE TABLE IF NOT EXISTS sat.actividades_vec_auditoria (
  id_auditoria bigserial PRIMARY KEY,
  id_actividades_vec uuid NOT NULL
    REFERENCES sat.actividades_vec(id_actividades_vec) ON DELETE CASCADE,
  accion varchar(20) NOT NULL CHECK (accion IN ('CREAR', 'EDITAR', 'CAMBIAR_ESTADO')),
  id_usuario text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividades_vec_auditoria_evento
  ON sat.actividades_vec_auditoria (id_actividades_vec, creado_en DESC);

CREATE TABLE IF NOT EXISTS sat.actividades_vec_participantes_auditoria (
  id_auditoria bigserial PRIMARY KEY,
  id_actividades_vec_participantes uuid NOT NULL
    REFERENCES sat.actividades_vec_participantes(id_actividades_vec_participantes) ON DELETE CASCADE,
  accion varchar(30) NOT NULL CHECK (accion = 'EDITAR_TIPO_APOYO'),
  id_usuario text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividades_vec_participantes_auditoria
  ON sat.actividades_vec_participantes_auditoria (id_actividades_vec_participantes, creado_en DESC);

COMMIT;
