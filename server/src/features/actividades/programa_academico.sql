BEGIN;

ALTER TABLE sat.actividades_vec
  ADD COLUMN IF NOT EXISTS programa_academico varchar(250);

COMMIT;
