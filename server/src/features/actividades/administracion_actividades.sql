-- Extiende jornadas VEC existentes para permitir administración de estado.
-- No reemplaza ni duplica las tablas del módulo.
BEGIN;

ALTER TABLE sat.actividades_vec
  ADD COLUMN IF NOT EXISTS estado varchar(20) NOT NULL DEFAULT 'PROGRAMADA',
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ubicacion text,
  ADD COLUMN IF NOT EXISTS variables_modalidades text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE sat.participantes_vec
  ADD COLUMN IF NOT EXISTS detalle_tipo_participante varchar(120),
  ADD COLUMN IF NOT EXISTS lugar_nacimiento varchar(250);

CREATE TABLE IF NOT EXISTS sat.catalogo_bienestar_actividades (
  programa varchar(250) PRIMARY KEY,
  componente varchar(250),
  linea_accion varchar(250),
  estrategia_politica_bienestar text,
  estrategia_politica_permanencia text,
  estrategia_politica_educacion_inclusiva text,
  numero_tipo_apoyo smallint,
  tipo_apoyo_excel varchar(200),
  orden_excel integer,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sat.apoyos_actividades_vec (
  id_tipos_apoyo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero smallint NOT NULL UNIQUE,
  nombre varchar(120) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sat.apoyos_actividades_vec (id_tipos_apoyo, numero, nombre, activo)
SELECT id_tipos_apoyo, numero, nombre, activo
FROM sat.tipos_apoyo
WHERE numero IS NOT NULL
ON CONFLICT (numero) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sat.catalogo_bienestar_actividades'::regclass
      AND conname = 'catalogo_bienestar_actividades_numero_tipo_apoyo_fkey'
  ) THEN
    ALTER TABLE sat.catalogo_bienestar_actividades
      ADD CONSTRAINT catalogo_bienestar_actividades_numero_tipo_apoyo_fkey
      FOREIGN KEY (numero_tipo_apoyo)
      REFERENCES sat.apoyos_actividades_vec(numero)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sat.actividades_vec_modalidades (
  id_actividades_vec uuid NOT NULL
    REFERENCES sat.actividades_vec(id_actividades_vec) ON DELETE CASCADE,
  programa varchar(250) NOT NULL,
  id_tipos_apoyo uuid
    REFERENCES sat.apoyos_actividades_vec(id_tipos_apoyo) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_actividades_vec, programa)
);

ALTER TABLE sat.actividades_vec_modalidades
  DROP CONSTRAINT IF EXISTS actividades_vec_modalidades_id_tipos_apoyo_fkey;

ALTER TABLE sat.actividades_vec_modalidades
  DROP CONSTRAINT IF EXISTS actividades_vec_modalidades_id_apoyos_vec_fkey;

ALTER TABLE sat.actividades_vec_participantes
  DROP CONSTRAINT IF EXISTS actividades_vec_participantes_id_tipos_apoyo_fkey;

ALTER TABLE sat.actividades_vec_participantes
  DROP CONSTRAINT IF EXISTS actividades_vec_participantes_id_apoyos_vec_fkey;

ALTER TABLE sat.actividades_vec_modalidades
  ADD CONSTRAINT actividades_vec_modalidades_id_apoyos_vec_fkey
  FOREIGN KEY (id_tipos_apoyo)
  REFERENCES sat.apoyos_actividades_vec(id_tipos_apoyo) ON DELETE RESTRICT;

ALTER TABLE sat.actividades_vec_participantes
  ADD CONSTRAINT actividades_vec_participantes_id_apoyos_vec_fkey
  FOREIGN KEY (id_tipos_apoyo)
  REFERENCES sat.apoyos_actividades_vec(id_tipos_apoyo) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_actividades_vec_modalidades_apoyo
  ON sat.actividades_vec_modalidades (id_tipos_apoyo);

ALTER TABLE sat.catalogo_bienestar_actividades
  ADD COLUMN IF NOT EXISTS tipo_apoyo_excel varchar(200),
  ADD COLUMN IF NOT EXISTS orden_excel integer;

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
