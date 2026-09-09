-- ==========================================================================
--  SAT-UNICESMAG - Seed de tablas de catálogo (schema `sat`)
-- ==========================================================================
--  Puebla las tablas de catálogo que la app necesita para funcionar pero que
--  no dependen de datos de operación:
--
--    sat.roles          -> los 5 roles del sistema (RBAC), mismos ids que
--                          server/src/shared/data/menuConfig.js y
--                          client/src/shared/config/menuConfig.js.
--    sat.rangos_riesgo  -> bandas de semaforización de riesgo (RQF11) que
--                          consume GET /api/administracion/umbrales-riesgo
--                          (lee puntaje_min de las filas 'Alto' y 'Medio').
--
--  Es idempotente: se puede volver a correr sin duplicar filas.
--    - sat.roles tiene UNIQUE(nombre)  -> ON CONFLICT DO NOTHING.
--    - sat.rangos_riesgo NO tiene UNIQUE -> INSERT ... WHERE NOT EXISTS.
--
--  Ejecutar:  psql "<cadena de conexión>" -f server/src/shared/db/seed.sql
--        o:   npm run db:seed   (si se agrega el script)
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
--  sat.roles
--  `nombre` guarda el identificador corto (admin, profesional, ...) porque
--  la tabla no tiene columna de código; así lo consume GET /usuarios
--  (devuelve roles.nombre como `rol`) y el lookup de POST /usuarios.
--  `descripcion` guarda la etiqueta legible.
-- --------------------------------------------------------------------------
INSERT INTO sat.roles (nombre, descripcion, es_sistema, activo) VALUES
  ('admin',               'Rol Administrativo',        true, true),
  ('profesional',         'Rol Profesionales',         true, true),
  ('directivo',           'Rol Directivos',            true, true),
  ('reporte_actividades', 'Rol Reporte Actividades',   true, true),
  ('estudiante',          'Rol Estudiante',            true, true)
ON CONFLICT (nombre) DO NOTHING;

-- --------------------------------------------------------------------------
--  sat.rangos_riesgo
--  Escala de puntaje 0–15 (el formulario de Administración usa min=1 max=15).
--  Bandas sin solape:  Bajo [0–5.99]  Medio [6–9.99]  Alto [10–15].
--  color_hex = variables --risk-* del cliente (variables.css).
--  El endpoint de umbrales solo lee puntaje_min de 'Alto' y 'Medio'.
-- --------------------------------------------------------------------------
INSERT INTO sat.rangos_riesgo (nombre, color_hex, puntaje_min, puntaje_max, orden, activo)
SELECT v.nombre, v.color_hex, v.puntaje_min, v.puntaje_max, v.orden, true
FROM (VALUES
  ('Bajo',  '#059669',  0.00,  5.99, 1::smallint),
  ('Medio', '#D97706',  6.00,  9.99, 2::smallint),
  ('Alto',  '#DC2626', 10.00, 15.00, 3::smallint)
) AS v(nombre, color_hex, puntaje_min, puntaje_max, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM sat.rangos_riesgo r WHERE lower(r.nombre) = lower(v.nombre)
);

COMMIT;
