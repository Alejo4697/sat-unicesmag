BEGIN;

ALTER TABLE sat.actividades_vec_permisos_linea_accion
  ADD COLUMN IF NOT EXISTS solo_actividades_propias boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM sat.usuarios
    WHERE LOWER(BTRIM(correo_institucional)) = ANY(ARRAY[
      'usp@unicesmag.edu.co',
      'usmg@unicesmag.edu.co'
    ]::text[])
      AND activo = true
  ) <> 2 THEN
    RAISE EXCEPTION 'No se encontraron activas las dos cuentas autorizadas para actividades propias.';
  END IF;
END $$;

INSERT INTO sat.actividades_vec_permisos_linea_accion (
  id_usuarios,
  lineas_accion,
  acceso_global,
  solo_actividades_propias
)
SELECT id_usuarios,
       ARRAY['Desarrollo Humano y Salud']::text[],
       false,
       true
FROM sat.usuarios
WHERE LOWER(BTRIM(correo_institucional)) = ANY(ARRAY[
  'usp@unicesmag.edu.co',
  'usmg@unicesmag.edu.co'
]::text[])
  AND activo = true
ON CONFLICT (id_usuarios) DO UPDATE SET
  lineas_accion = EXCLUDED.lineas_accion,
  acceso_global = EXCLUDED.acceso_global,
  solo_actividades_propias = EXCLUDED.solo_actividades_propias;

COMMIT;
