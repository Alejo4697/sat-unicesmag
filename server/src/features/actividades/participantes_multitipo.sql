-- Permite que la misma persona tenga inscripciones VEC en tipos distintos,
-- pero mantiene una sola inscripción por persona y tipo.
BEGIN;

ALTER TABLE sat.participantes_vec
  DROP CONSTRAINT IF EXISTS uq_participantes_vec_persona;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'sat.participantes_vec'::regclass
      AND conname = 'uq_participantes_vec_persona_tipo'
  ) THEN
    ALTER TABLE sat.participantes_vec
      ADD CONSTRAINT uq_participantes_vec_persona_tipo
      UNIQUE (id_personas, tipo_participante);
  END IF;
END $$;

COMMIT;
