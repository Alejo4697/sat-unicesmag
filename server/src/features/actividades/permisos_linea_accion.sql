BEGIN;

CREATE TABLE IF NOT EXISTS sat.actividades_vec_permisos_linea_accion (
  id_usuarios uuid PRIMARY KEY
    REFERENCES sat.usuarios (id_usuarios) ON DELETE CASCADE,
  lineas_accion text[] NOT NULL DEFAULT ARRAY[]::text[],
  acceso_global boolean NOT NULL DEFAULT false,
  CONSTRAINT actividades_vec_permisos_linea_accion_alcance_check
    CHECK (acceso_global OR cardinality(lineas_accion) > 0)
);

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
      ('carolina.martinez@unicesmag.edu.co')
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
  id_usuarios, lineas_accion, acceso_global
)
SELECT usuario.id_usuarios, asignacion.lineas_accion, asignacion.acceso_global
FROM (VALUES
  (
    'jlmoreno@unicesmag.edu.co',
    ARRAY['Acompañamiento']::text[],
    false
  ),
  (
    'geenriquez@unicesmag.edu.co',
    ARRAY['Arte y Cultura', 'Deporte Recreación y Actividad Física']::text[],
    false
  ),
  (
    'yzuniga@unicesmag.edu.co',
    ARRAY['Desarrollo Humano y Salud']::text[],
    false
  ),
  (
    'darodriguez@unicesmag.edu.co',
    ARRAY['Pastoral franciscano - capuchina']::text[],
    false
  ),
  (
    'jerodriguez@unicesmag.edu.co',
    ARRAY['Paz y Convivencia']::text[],
    false
  ),
  (
    'carolina.martinez@unicesmag.edu.co',
    ARRAY[]::text[],
    true
  )
) AS asignacion(correo, lineas_accion, acceso_global)
JOIN sat.usuarios usuario
  ON LOWER(BTRIM(usuario.correo_institucional)) = asignacion.correo
 AND usuario.activo = true
ON CONFLICT (id_usuarios) DO UPDATE SET
  lineas_accion = EXCLUDED.lineas_accion,
  acceso_global = EXCLUDED.acceso_global;

COMMIT;
