BEGIN;

CREATE TABLE IF NOT EXISTS sat.actividades_vec_permisos_linea_accion (
  id_usuarios uuid PRIMARY KEY
    REFERENCES sat.usuarios (id_usuarios) ON DELETE CASCADE,
  lineas_accion text[] NOT NULL DEFAULT ARRAY[]::text[],
  acceso_global boolean NOT NULL DEFAULT false,
  solo_actividades_propias boolean NOT NULL DEFAULT false,
  CONSTRAINT actividades_vec_permisos_linea_accion_alcance_check
    CHECK (acceso_global OR cardinality(lineas_accion) > 0)
);

ALTER TABLE sat.actividades_vec_permisos_linea_accion
  ADD COLUMN IF NOT EXISTS solo_actividades_propias boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('jlmoreno@unicesmag.edu.co'),
      ('geenriquez@unicesmag.edu.co'),
      ('yzuniga@unicesmag.edu.co'),
      ('darodriguez@unicesmag.edu.co'),
      ('jerodriguez@unicesmag.edu.co'),
      ('carolina.martinez@unicesmag.edu.co'),
      ('adm.advicer@unicesmag.edu.co'),
      ('mpagreda@unicesmag.edu.co'),
      ('usp@unicesmag.edu.co'),
      ('usmg@unicesmag.edu.co')
    ) AS asignacion(correo)
    WHERE NOT EXISTS (
      SELECT 1
      FROM sat.usuarios usuario
      WHERE LOWER(BTRIM(usuario.correo_institucional)) = asignacion.correo
        AND usuario.activo = true
    )
  ) THEN
    RAISE EXCEPTION 'No se encontraron todas las cuentas activas asignadas a Actividades VEC.';
  END IF;
END $$;

INSERT INTO sat.actividades_vec_permisos_linea_accion (
  id_usuarios, lineas_accion, acceso_global, solo_actividades_propias
)
SELECT usuario.id_usuarios, asignacion.lineas_accion, asignacion.acceso_global,
       asignacion.solo_actividades_propias
FROM (VALUES
  (
    'jlmoreno@unicesmag.edu.co',
    ARRAY['Acompañamiento']::text[],
    false,
    false
  ),
  (
    'geenriquez@unicesmag.edu.co',
    ARRAY['Arte y Cultura', 'Deporte Recreación y Actividad Física']::text[],
    false,
    false
  ),
  (
    'yzuniga@unicesmag.edu.co',
    ARRAY['Desarrollo Humano y Salud']::text[],
    false,
    false
  ),
  (
    'darodriguez@unicesmag.edu.co',
    ARRAY['Pastoral franciscano - capuchina']::text[],
    false,
    false
  ),
  (
    'jerodriguez@unicesmag.edu.co',
    ARRAY['Paz y Convivencia']::text[],
    false,
    false
  ),
  (
    'carolina.martinez@unicesmag.edu.co',
    ARRAY[]::text[],
    true,
    false
  ),
  (
    'adm.advicer@unicesmag.edu.co',
    ARRAY[]::text[],
    true,
    false
  ),
  (
    'mpagreda@unicesmag.edu.co',
    ARRAY[]::text[],
    true,
    false
  ),
  (
    'usp@unicesmag.edu.co',
    ARRAY['Desarrollo Humano y Salud']::text[],
    false,
    true
  ),
  (
    'usmg@unicesmag.edu.co',
    ARRAY['Desarrollo Humano y Salud']::text[],
    false,
    true
  )
) AS asignacion(correo, lineas_accion, acceso_global, solo_actividades_propias)
JOIN sat.usuarios usuario
  ON LOWER(BTRIM(usuario.correo_institucional)) = asignacion.correo
 AND usuario.activo = true
ON CONFLICT (id_usuarios) DO UPDATE SET
  lineas_accion = EXCLUDED.lineas_accion,
  acceso_global = EXCLUDED.acceso_global,
  solo_actividades_propias = EXCLUDED.solo_actividades_propias;

COMMIT;
