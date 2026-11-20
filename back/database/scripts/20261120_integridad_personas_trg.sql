-- ============================================================================
-- SAT-UNICESMAG: INTEGRIDAD DE LA TABLA PRINCIPAL (sat.personas)
-- Garantiza que sat.personas sea el ÚNICO origen de la verdad y elimina
-- el riesgo de divergencia / inconsistencia por datos duplicados en roles.
-- ============================================================================

-- 1. Vincular cualquier usuario sin id_personas a la tabla sat.personas
INSERT INTO sat.personas (
  numero_identificacion,
  primer_nombre,
  primer_apellido,
  correo_institucional,
  cargo
)
SELECT 
  u.numero_documento,
  SPLIT_PART(u.nombres, ' ', 1),
  SPLIT_PART(u.apellidos, ' ', 1),
  u.correo_institucional,
  u.cargo
FROM sat.usuarios u
LEFT JOIN sat.personas p ON p.numero_identificacion = u.numero_documento
WHERE p.id IS NULL
ON CONFLICT (numero_identificacion) DO NOTHING;

UPDATE sat.usuarios u
SET id_personas = p.id
FROM sat.personas p
WHERE p.numero_identificacion = u.numero_documento
  AND u.id_personas IS NULL;

-- 2. Función y Trigger: Al actualizar sat.personas, propagar automáticamente
-- a las tablas sat.estudiantes, sat.docentes y sat.usuarios para evitar duplicidad desincronizada.
CREATE OR REPLACE FUNCTION sat.fn_propagar_cambios_persona()
RETURNS trigger AS $$
BEGIN
  -- Actualizar sat.estudiantes
  UPDATE sat.estudiantes
  SET
    nombres = TRIM(CONCAT_WS(' ', NEW.primer_nombre, NEW.segundo_nombre)),
    apellidos = TRIM(CONCAT_WS(' ', NEW.primer_apellido, NEW.segundo_apellido)),
    numero_documento = NEW.numero_identificacion,
    correo_institucional = COALESCE(NEW.correo_institucional, correo_institucional),
    correo_personal = COALESCE(NEW.correo_electronico, correo_personal),
    telefono = COALESCE(NEW.celular, NEW.telefono, telefono),
    direccion = COALESCE(NEW.direccion, direccion),
    actualizado_en = NOW()
  WHERE id_personas = NEW.id;

  -- Actualizar sat.docentes
  UPDATE sat.docentes
  SET
    nombres = TRIM(CONCAT_WS(' ', NEW.primer_nombre, NEW.segundo_nombre)),
    apellidos = TRIM(CONCAT_WS(' ', NEW.primer_apellido, NEW.segundo_apellido)),
    numero_documento = NEW.numero_identificacion,
    correo_institucional = COALESCE(NEW.correo_institucional, correo_institucional)
  WHERE id_personas = NEW.id;

  -- Actualizar sat.usuarios
  UPDATE sat.usuarios
  SET
    nombres = TRIM(CONCAT_WS(' ', NEW.primer_nombre, NEW.segundo_nombre)),
    apellidos = TRIM(CONCAT_WS(' ', NEW.primer_apellido, NEW.segundo_apellido)),
    numero_documento = NEW.numero_identificacion,
    correo_institucional = COALESCE(NEW.correo_institucional, correo_institucional),
    actualizado_en = NOW()
  WHERE id_personas = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagar_cambios_persona ON sat.personas;
CREATE TRIGGER trg_propagar_cambios_persona
AFTER UPDATE ON sat.personas
FOR EACH ROW
EXECUTE FUNCTION sat.fn_propagar_cambios_persona();
