-- ============================================================================
-- Migración: Perfiles, Dependencias, Seguridad de Acceso y Sesiones
-- Schema: sat
-- ============================================================================

BEGIN;

-- 1. Ampliar sat.usuarios para seguridad y metadatos de cargo
ALTER TABLE sat.usuarios
  ADD COLUMN IF NOT EXISTS cargo character varying,
  ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamp with time zone;

-- 2. Asegurar soporte de sesiones tanto para funcionarios (id_usuarios)
--    como para estudiantes (id_estudiantes)
ALTER TABLE sat.sesiones
  ALTER COLUMN id_usuarios DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS id_estudiantes uuid,
  ADD COLUMN IF NOT EXISTS ultimo_acceso_en timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sesiones_estudiante ON sat.sesiones(id_estudiantes);
CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sat.sesiones(token_sesion);

-- 3. Crear tabla sat.usuarios_programas para alcance de Directores y Coordinadores
CREATE TABLE IF NOT EXISTS sat.usuarios_programas (
  id_usuarios uuid NOT NULL REFERENCES sat.usuarios(id_usuarios) ON DELETE CASCADE,
  id_programas_academicos uuid NOT NULL REFERENCES sat.programas_academicos(id_programas_academicos) ON DELETE CASCADE,
  rol_en_programa character varying DEFAULT 'DIRECTOR',
  asignado_en timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id_usuarios, id_programas_academicos)
);

-- 4. Registrar dependencias faltantes según la imagen del usuario
--    Tipo: 'AREA_ATENCION' para las que reciben remisiones,
--          'UNIDAD_INTERNA' para unidades administrativas/directivas.
INSERT INTO sat.dependencias (nombre, tipo, es_confidencialidad_especial, activo) VALUES
  ('Vicerrectoría de Evangelización de las Culturas', 'UNIDAD_INTERNA', false, true),
  ('Coordinación de Acompañamiento',                  'UNIDAD_INTERNA', false, true),
  ('Docentes Asistenciales Unidad Servicios Psicológicos', 'AREA_ATENCION', true, true),
  ('Psicólogos de Área',                              'AREA_ATENCION', true,  true),
  ('Coordinador de Servicios Psicológicos',           'AREA_ATENCION', true,  true),
  ('Docentes Tutor',                                  'AREA_ATENCION', false, true),
  ('Dirección de Programas Académicos',               'UNIDAD_INTERNA', false, true),
  ('Coordinación de Especializaciones',               'UNIDAD_INTERNA', false, true),
  ('Coordinación Académica',                          'UNIDAD_INTERNA', false, true),
  ('Docentes Acompañantes',                           'UNIDAD_INTERNA', false, true)
ON CONFLICT (nombre) DO NOTHING;

-- 5. Homogeneizar roles antiguos hacia los oficiales (minúsculas)
-- Asignar rol 'admin' al usuario que tenía 'ADMINISTRADOR'
INSERT INTO sat.usuarios_roles (id_usuarios, id_roles)
SELECT u.id_usuarios, r_target.id_roles
FROM sat.usuarios u
JOIN sat.usuarios_roles ur ON ur.id_usuarios = u.id_usuarios
JOIN sat.roles r_orig ON r_orig.id_roles = ur.id_roles AND r_orig.nombre = 'ADMINISTRADOR'
CROSS JOIN sat.roles r_target
WHERE r_target.nombre = 'admin'
ON CONFLICT DO NOTHING;

-- Asignar rol 'estudiante' al usuario que tenía 'ESTUDIANTE'
INSERT INTO sat.usuarios_roles (id_usuarios, id_roles)
SELECT u.id_usuarios, r_target.id_roles
FROM sat.usuarios u
JOIN sat.usuarios_roles ur ON ur.id_usuarios = u.id_usuarios
JOIN sat.roles r_orig ON r_orig.id_roles = ur.id_roles AND r_orig.nombre = 'ESTUDIANTE'
CROSS JOIN sat.roles r_target
WHERE r_target.nombre = 'estudiante'
ON CONFLICT DO NOTHING;

-- 6. Asignar cargos institucionales a los usuarios existentes
UPDATE sat.usuarios SET cargo = 'Coordinadora de Acompañamiento Institucional'
WHERE correo_institucional = 'carolina.martinez@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Vicerrectoría de Evangelización de las Culturas'
WHERE correo_institucional = 'admin@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Director Programa Ingeniería de Sistemas'
WHERE correo_institucional = 'carlos.mora@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Directora Programa Psicología'
WHERE correo_institucional = 'helena.pantoja@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Coordinador Consultorios Jurídicos'
WHERE correo_institucional = 'andres.caicedo@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Coordinador Pastoral Universitaria'
WHERE correo_institucional = 'jairo.gomez@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Psicólogo de Área - Unidad de Servicios Psicológicos (USP)'
WHERE correo_institucional = 'juan.botina@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Trabajo Social'
WHERE correo_institucional = 'marcela.guerrero@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Enfermera - Área de Salud San Damián'
WHERE correo_institucional = 'patricia.erazo@unicesmag.edu.co';

UPDATE sat.usuarios SET cargo = 'Secretaria de Bienestar Institucional'
WHERE correo_institucional = 'diana.benavides@unicesmag.edu.co';

-- 7. Vincular usuarios a sus dependencias en sat.usuarios_dependencias
-- Carolina Martínez -> Coordinación de Acompañamiento
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'carolina.martinez@unicesmag.edu.co'
  AND d.nombre = 'Coordinación de Acompañamiento'
ON CONFLICT DO NOTHING;

-- Admin -> Vicerrectoría
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'admin@unicesmag.edu.co'
  AND d.nombre = 'Vicerrectoría de Evangelización de las Culturas'
ON CONFLICT DO NOTHING;

-- Juan Botina -> USP
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'juan.botina@unicesmag.edu.co'
  AND d.nombre = 'Unidad de Servicios Psicológicos (USP)'
ON CONFLICT DO NOTHING;

-- Andres Caicedo -> Consultorios Jurídicos
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'andres.caicedo@unicesmag.edu.co'
  AND d.nombre = 'Consultorios Jurídicos'
ON CONFLICT DO NOTHING;

-- Jairo Gómez -> Pastoral
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'jairo.gomez@unicesmag.edu.co'
  AND d.nombre = 'Pastoral Universitaria'
ON CONFLICT DO NOTHING;

-- Marcela Guerrero -> Trabajo Social
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'marcela.guerrero@unicesmag.edu.co'
  AND d.nombre = 'Trabajo Social'
ON CONFLICT DO NOTHING;

-- Patricia Erazo -> Enfermería San Damián
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'patricia.erazo@unicesmag.edu.co'
  AND d.nombre = 'Enfermería San Damián'
ON CONFLICT DO NOTHING;

-- Diana Benavides -> Deporte y Cultura
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, false
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'diana.benavides@unicesmag.edu.co'
  AND d.nombre = 'Deporte y Cultura'
ON CONFLICT DO NOTHING;

-- Carlos Mora -> Dirección de Programas Académicos
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'carlos.mora@unicesmag.edu.co'
  AND d.nombre = 'Dirección de Programas Académicos'
ON CONFLICT DO NOTHING;

-- Helena Pantoja -> Coordinación Académica
INSERT INTO sat.usuarios_dependencias (id_usuarios, id_dependencias, es_responsable)
SELECT u.id_usuarios, d.id_dependencias, true
FROM sat.usuarios u, sat.dependencias d
WHERE u.correo_institucional = 'helena.pantoja@unicesmag.edu.co'
  AND d.nombre = 'Coordinación Académica'
ON CONFLICT DO NOTHING;

-- 8. Vincular directivos a sus programas académicos correspondientes
-- Carlos Mora -> Ingeniería de Sistemas
INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa)
SELECT u.id_usuarios, p.id_programas_academicos, 'DIRECTOR'
FROM sat.usuarios u, sat.programas_academicos p
WHERE u.correo_institucional = 'carlos.mora@unicesmag.edu.co'
  AND p.nombre = 'Ingeniería de Sistemas'
ON CONFLICT DO NOTHING;

-- Helena Pantoja -> Psicología
INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa)
SELECT u.id_usuarios, p.id_programas_academicos, 'COORDINADOR_ACADEMICO'
FROM sat.usuarios u, sat.programas_academicos p
WHERE u.correo_institucional = 'helena.pantoja@unicesmag.edu.co'
  AND p.nombre = 'Psicología'
ON CONFLICT DO NOTHING;

COMMIT;
