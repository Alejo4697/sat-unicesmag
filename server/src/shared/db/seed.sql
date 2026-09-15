-- ==========================================================================
--  SAT-UNICESMAG - Seed de tablas de catálogo (schema `sat`)
-- ==========================================================================
--  Puebla las tablas de catálogo que la app necesita para funcionar pero que
--  no dependen de datos de operación:
--
--    sat.roles              -> los 5 roles del sistema (RBAC), mismos ids que
--                              server/src/shared/data/menuConfig.js y
--                              client/src/shared/config/menuConfig.js.
--    sat.rangos_riesgo      -> bandas de semaforización de riesgo (RQF11) que
--                              consume GET /api/administracion/umbrales-riesgo
--                              (lee puntaje_min de las filas 'Alto' y 'Medio').
--    sat.dependencias       -> áreas de atención destino de remisiones (RQF17),
--                              catálogo administrable desde Administración.
--    sat.estados_remision   -> flujo de estados de la bandeja de remisiones (RQF18).
--    sat.tipos_intervencion -> tipos del formulario de Intervenciones (RQF04).
--
--  Es idempotente: se puede volver a correr sin duplicar filas.
--    - sat.roles / sat.dependencias / sat.estados_remision tienen UNIQUE(nombre)
--      -> ON CONFLICT DO NOTHING.
--    - sat.rangos_riesgo / sat.tipos_intervencion NO tienen UNIQUE
--      -> INSERT ... WHERE NOT EXISTS.
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

-- --------------------------------------------------------------------------
--  sat.dependencias  (áreas de atención destino de remisiones - RQF17)
--  Portado de AREAS_DESTINO en client/src/shared/panels/RemisionesPanel.jsx.
--  `tipo` = 'AREA_ATENCION' distingue estas filas de otras dependencias que
--  usan la misma tabla (programas académicos, unidades administrativas) y que
--  NO se administran desde el catálogo de Administración.
--  `es_confidencialidad_especial` = true en las áreas con reserva VBG (RNF01):
--  USP y Consultorios Jurídicos (coincide con puedeVerDetalleVBG() del mock).
--  nombre es UNIQUE -> ON CONFLICT DO NOTHING.
-- --------------------------------------------------------------------------
INSERT INTO sat.dependencias (nombre, tipo, es_confidencialidad_especial, activo) VALUES
  ('Unidad de Servicios Psicológicos (USP)',    'AREA_ATENCION', true,  true),
  ('Trabajo Social',                            'AREA_ATENCION', false, true),
  ('Área de Salud María Goretti / Enfermería',  'AREA_ATENCION', false, true),
  ('Consultorios Jurídicos',                    'AREA_ATENCION', true,  true),
  ('Pastoral Universitaria',                    'AREA_ATENCION', false, true),
  ('Paz y Convivencia',                         'AREA_ATENCION', false, true),
  ('Tutoría Académica Docente',                 'AREA_ATENCION', false, true)
ON CONFLICT (nombre) DO NOTHING;

-- --------------------------------------------------------------------------
--  sat.estados_remision  (flujo de la bandeja de remisiones - RQF18)
--  Portado de ESTADOS en RemisionesPanel.jsx, en el mismo orden.
--  es_final = true en los estados que cierran el flujo: 'Atendida' y
--  'Devuelta con Observaciones'.
--  nombre es UNIQUE -> ON CONFLICT DO NOTHING.
-- --------------------------------------------------------------------------
INSERT INTO sat.estados_remision (nombre, orden, es_final, activo) VALUES
  ('Generada',                    1, false, true),
  ('Recibida/Asignada',           2, false, true),
  ('En Atención',                 3, false, true),
  ('Atendida',                    4, true,  true),
  ('Devuelta con Observaciones',  5, true,  true)
ON CONFLICT (nombre) DO NOTHING;

-- --------------------------------------------------------------------------
--  sat.tipos_intervencion  (tipos del formulario de Intervenciones - RQF04)
--  El mockup no tenía este catálogo (la intervención no capturaba "tipo");
--  se agrega porque sat.intervenciones.id_tipos_intervencion es NOT NULL.
--  Set inicial derivado de los `motivo` de MOCK_DATA.intervenciones y de las
--  áreas de sat.dependencias.
--  TODO: validar nomenclatura con Paola Zuñiga
--  sat.tipos_intervencion NO tiene UNIQUE(nombre) -> INSERT ... WHERE NOT EXISTS.
-- --------------------------------------------------------------------------
INSERT INTO sat.tipos_intervencion (nombre, descripcion, activo)
SELECT v.nombre, v.descripcion, true
FROM (VALUES
  ('Orientación psicológica individual', 'Proceso de escucha y acompañamiento emocional (USP).'),
  ('Asesoría jurídica',                  'Orientación legal y medidas de protección, incluye casos VBG (Consultorios Jurídicos).'),
  ('Tutoría / refuerzo académico',       'Acompañamiento por bajo rendimiento o dificultades de aprendizaje.'),
  ('Atención en salud / enfermería',     'Valoración y canalización en salud física (Área de Salud María Goretti).'),
  ('Gestión socioeconómica',             'Apoyo en dificultades económicas, movilidad o permanencia (Trabajo Social).'),
  ('Acompañamiento pastoral',            'Acompañamiento espiritual y de bienestar integral (Pastoral Universitaria).')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (
  SELECT 1 FROM sat.tipos_intervencion t WHERE lower(t.nombre) = lower(v.nombre)
);

COMMIT;
