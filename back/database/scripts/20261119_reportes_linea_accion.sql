BEGIN;

CREATE TABLE IF NOT EXISTS sat.actividades_vec_permisos_reporte_linea (
  id_usuarios uuid PRIMARY KEY
    REFERENCES sat.usuarios (id_usuarios) ON DELETE CASCADE,
  lineas_accion text[] NOT NULL
    CHECK (cardinality(lineas_accion) > 0)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('jlmoreno@unicesmag.edu.co'),
      ('geenriquez@unicesmag.edu.co'),
      ('pastoral@unicesmag.edu.co'),
      ('jerodriguez@unicesmag.edu.co')
    ) AS asignacion(correo)
    WHERE NOT EXISTS (
      SELECT 1
      FROM sat.usuarios usuario
      WHERE LOWER(BTRIM(usuario.correo_institucional)) = asignacion.correo
        AND usuario.activo = true
        AND usuario.eliminado_en IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'No se encontraron todas las cuentas activas asignadas al reporte por línea.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('Acompañamiento'),
      ('Arte y Cultura'),
      ('Deporte Recreación y Actividad Física'),
      ('Pastoral franciscano - capuchina'),
      ('Paz y Convivencia')
    ) AS asignacion(linea)
    WHERE NOT EXISTS (
      SELECT 1
      FROM sat.catalogo_actividades_vec actividad
      WHERE BTRIM(actividad.linea_accion) = asignacion.linea
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sat.catalogo_bienestar_actividades bienestar
      WHERE BTRIM(bienestar.linea_accion) = asignacion.linea
    )
  ) THEN
    RAISE EXCEPTION 'No se encontraron todas las líneas de acción configuradas para el reporte.';
  END IF;
END $$;

INSERT INTO sat.actividades_vec_permisos_reporte_linea (
  id_usuarios, lineas_accion
)
SELECT usuario.id_usuarios, asignacion.lineas_accion
FROM (VALUES
  (
    'jlmoreno@unicesmag.edu.co',
    ARRAY['Acompañamiento']::text[]
  ),
  (
    'geenriquez@unicesmag.edu.co',
    ARRAY['Arte y Cultura', 'Deporte Recreación y Actividad Física']::text[]
  ),
  (
    'pastoral@unicesmag.edu.co',
    ARRAY['Pastoral franciscano - capuchina']::text[]
  ),
  (
    'jerodriguez@unicesmag.edu.co',
    ARRAY['Paz y Convivencia']::text[]
  )
) AS asignacion(correo, lineas_accion)
JOIN sat.usuarios usuario
  ON LOWER(BTRIM(usuario.correo_institucional)) = asignacion.correo
 AND usuario.activo = true
 AND usuario.eliminado_en IS NULL
ON CONFLICT (id_usuarios) DO UPDATE SET
  lineas_accion = EXCLUDED.lineas_accion;

COMMIT;
