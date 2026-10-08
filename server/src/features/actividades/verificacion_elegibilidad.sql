-- Estado independiente para verificar asistencia sobre inscripciones existentes.
BEGIN;

ALTER TABLE sat.actividades_vec_participantes
  ADD COLUMN IF NOT EXISTS asistencia_verificada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_en timestamptz,
  ADD COLUMN IF NOT EXISTS asistencia_verificada_por text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_actividades_vec_participante
  ON sat.actividades_vec_participantes (id_actividades_vec, id_participantes_vec);

COMMIT;
