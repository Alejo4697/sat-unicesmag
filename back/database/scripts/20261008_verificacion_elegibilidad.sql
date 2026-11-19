-- Estado independiente para verificar asistencia sobre inscripciones existentes.
BEGIN;

ALTER TABLE sat.actividades_vec_participantes
  ADD COLUMN IF NOT EXISTS asistencia_verificada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_en timestamptz,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_por text,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_origen text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS estado_asistencia varchar(20) NOT NULL DEFAULT 'PENDIENTE';

UPDATE sat.actividades_vec_participantes
SET estado_asistencia = CASE
  WHEN asistencia_verificada THEN 'PRESENTE'
  ELSE 'PENDIENTE'
END
WHERE estado_asistencia IS NULL
   OR estado_asistencia NOT IN ('PENDIENTE', 'PRESENTE', 'AUSENTE')
   OR (asistencia_verificada = true AND estado_asistencia = 'PENDIENTE');

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_actividades_vec_participante
  ON sat.actividades_vec_participantes (id_actividades_vec, id_participantes_vec);

COMMIT;
