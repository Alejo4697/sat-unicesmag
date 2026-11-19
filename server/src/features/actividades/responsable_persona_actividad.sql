BEGIN;

ALTER TABLE sat.actividades_vec
  ADD COLUMN IF NOT EXISTS id_persona_responsable bigint
    REFERENCES sat.personas (id) ON DELETE SET NULL;

COMMIT;
