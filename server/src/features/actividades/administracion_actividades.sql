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

ALTER TABLE sat.participantes_vec
  DROP CONSTRAINT IF EXISTS participantes_vec_tipo_participante_check;

INSERT INTO sat.participantes_vec (
  id_personas, tipo_participante, detalle_tipo_participante
)
SELECT DISTINCT persona.id, 'COLABORADOR', 'Docente'
FROM sat.docentes docente
JOIN sat.personas persona
  ON persona.id = docente.id_personas
  OR (
    docente.id_personas IS NULL
    AND persona.numero_identificacion = docente.numero_documento
  )
WHERE docente.activo = true
ON CONFLICT (id_personas, tipo_participante) DO NOTHING;

INSERT INTO sat.participantes_vec (
  id_personas, tipo_participante, detalle_tipo_participante
)
SELECT DISTINCT COALESCE(usuario.id_personas, persona.id), 'COLABORADOR', 'Docente'
FROM sat.usuarios usuario
JOIN sat.usuarios_roles usuario_rol
  ON usuario_rol.id_usuarios = usuario.id_usuarios
JOIN sat.roles rol
  ON rol.id_roles = usuario_rol.id_roles
LEFT JOIN sat.personas persona
  ON persona.numero_identificacion = usuario.numero_documento
WHERE usuario.activo = true
  AND usuario.eliminado_en IS NULL
  AND rol.activo = true
  AND UPPER(BTRIM(rol.nombre)) IN ('DOCENTE', 'DOCENTE_PERMANENCIA')
  AND COALESCE(usuario.id_personas, persona.id) IS NOT NULL
ON CONFLICT (id_personas, tipo_participante) DO NOTHING;

ALTER TABLE sat.actividades_vec_participantes
  ADD COLUMN IF NOT EXISTS asistencia_verificada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_en timestamptz,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_por text,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_origen text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS estado_asistencia varchar(20) NOT NULL DEFAULT 'PENDIENTE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'sat'
      AND table_name = 'actividades_vec_participantes'
      AND column_name = 'asistencia_verificada'
  ) THEN
    UPDATE sat.actividades_vec_participantes
    SET estado_asistencia = 'PRESENTE'
    WHERE asistencia_verificada = true
      AND estado_asistencia = 'PENDIENTE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sat.actividades_vec_participantes'::regclass
      AND conname = 'actividades_vec_participantes_estado_asistencia_check'
  ) THEN
    ALTER TABLE sat.actividades_vec_participantes
      ADD CONSTRAINT actividades_vec_participantes_estado_asistencia_check
      CHECK (estado_asistencia IN ('PENDIENTE', 'PRESENTE', 'AUSENTE'));
  END IF;
END $$;

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

ALTER TABLE sat.actividades_vec_participantes
  ADD COLUMN IF NOT EXISTS programa_modalidad varchar(250);

ALTER TABLE sat.actividades_vec_participantes
  ADD COLUMN IF NOT EXISTS tipo_apoyo_otro varchar(250);

WITH modalidades_unicas AS (
  SELECT id_actividades_vec,
         id_tipos_apoyo,
         MIN(programa) AS programa
  FROM sat.actividades_vec_modalidades
  WHERE id_tipos_apoyo IS NOT NULL
  GROUP BY id_actividades_vec, id_tipos_apoyo
  HAVING COUNT(*) = 1
)
UPDATE sat.actividades_vec_participantes participante
SET programa_modalidad = modalidad.programa
FROM modalidades_unicas modalidad
WHERE participante.programa_modalidad IS NULL
  AND participante.id_actividades_vec = modalidad.id_actividades_vec
  AND participante.id_tipos_apoyo = modalidad.id_tipos_apoyo;

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

UPDATE sat.actividades_vec_participantes destino
SET id_tipos_apoyo = COALESCE(destino.id_tipos_apoyo, origen.id_tipos_apoyo),
    asistencia_verificada = destino.asistencia_verificada OR origen.asistencia_verificada,
    asistencia_verificada_en = COALESCE(destino.asistencia_verificada_en, origen.asistencia_verificada_en),
    asistencia_verificada_por = COALESCE(destino.asistencia_verificada_por, origen.asistencia_verificada_por),
    asistencia_verificada_origen = CASE
      WHEN destino.asistencia_verificada THEN destino.asistencia_verificada_origen
      ELSE origen.asistencia_verificada_origen
    END,
    estado_asistencia = CASE
      WHEN destino.estado_asistencia <> 'PENDIENTE' THEN destino.estado_asistencia
      ELSE origen.estado_asistencia
    END
FROM sat.participantes_vec docente
JOIN sat.participantes_vec colaborador
  ON colaborador.id_personas = docente.id_personas
 AND colaborador.tipo_participante = 'COLABORADOR'
JOIN sat.actividades_vec_participantes origen
  ON origen.id_participantes_vec = docente.id_participantes_vec
WHERE docente.tipo_participante = 'DOCENTE'
  AND destino.id_participantes_vec = colaborador.id_participantes_vec
  AND destino.id_actividades_vec = origen.id_actividades_vec;

UPDATE sat.actividades_vec_participantes origen
SET id_participantes_vec = colaborador.id_participantes_vec
FROM sat.participantes_vec docente
JOIN sat.participantes_vec colaborador
  ON colaborador.id_personas = docente.id_personas
 AND colaborador.tipo_participante = 'COLABORADOR'
WHERE docente.tipo_participante = 'DOCENTE'
  AND origen.id_participantes_vec = docente.id_participantes_vec
  AND NOT EXISTS (
    SELECT 1
    FROM sat.actividades_vec_participantes destino
    WHERE destino.id_actividades_vec = origen.id_actividades_vec
      AND destino.id_participantes_vec = colaborador.id_participantes_vec
  );

UPDATE sat.actividades_vec_participantes_auditoria auditoria
SET id_actividades_vec_participantes = destino.id_actividades_vec_participantes
FROM sat.actividades_vec_participantes origen
JOIN sat.participantes_vec docente
  ON docente.id_participantes_vec = origen.id_participantes_vec
 AND docente.tipo_participante = 'DOCENTE'
JOIN sat.participantes_vec colaborador
  ON colaborador.id_personas = docente.id_personas
 AND colaborador.tipo_participante = 'COLABORADOR'
JOIN sat.actividades_vec_participantes destino
  ON destino.id_participantes_vec = colaborador.id_participantes_vec
 AND destino.id_actividades_vec = origen.id_actividades_vec
WHERE auditoria.id_actividades_vec_participantes =
  origen.id_actividades_vec_participantes;

DELETE FROM sat.actividades_vec_participantes origen
USING sat.participantes_vec docente,
      sat.participantes_vec colaborador,
      sat.actividades_vec_participantes destino
WHERE docente.tipo_participante = 'DOCENTE'
  AND colaborador.tipo_participante = 'COLABORADOR'
  AND colaborador.id_personas = docente.id_personas
  AND origen.id_participantes_vec = docente.id_participantes_vec
  AND destino.id_participantes_vec = colaborador.id_participantes_vec
  AND destino.id_actividades_vec = origen.id_actividades_vec;

DELETE FROM sat.participantes_vec docente
USING sat.participantes_vec colaborador
WHERE docente.tipo_participante = 'DOCENTE'
  AND colaborador.tipo_participante = 'COLABORADOR'
  AND colaborador.id_personas = docente.id_personas;

UPDATE sat.participantes_vec
SET tipo_participante = 'COLABORADOR',
    detalle_tipo_participante = 'Docente',
    actualizado_en = now()
WHERE tipo_participante = 'DOCENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'sat.participantes_vec'::regclass
      AND conname = 'participantes_vec_tipo_participante_check'
  ) THEN
    ALTER TABLE sat.participantes_vec
      ADD CONSTRAINT participantes_vec_tipo_participante_check
      CHECK (tipo_participante IN (
        'ESTUDIANTE', 'COLABORADOR', 'EGRESADO', 'EXTERNO', 'ADMINISTRATIVO'
      ));
  END IF;
END $$;

COMMIT;
