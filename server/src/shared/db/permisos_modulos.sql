-- ==========================================================================
--  SAT-UNICESMAG - Matriz de Roles y Permisos por módulo (schema `sat`)
-- ==========================================================================
--  Carga los módulos del sistema y el permiso "acceso:<modulo>" de cada uno,
--  y asigna los permisos POR DEFECTO (los mismos que tenía menuConfig.js).
--  Desde ahí en adelante la matriz se edita en Administración.
--
--    sat.modulos         -> un registro por módulo (codigo = id del menú)
--    sat.permisos        -> "acceso:<codigo>" por módulo
--    sat.roles_permisos  -> rol x permiso
--
--  Idempotente y SEGURO de repetir: los permisos por defecto solo se
--  asignan cuando el permiso se crea por primera vez, así que volver a
--  correrlo NO devuelve accesos que el administrador haya quitado.
--
--  Requiere que existan los roles (npm run db:seed).
--  Ejecutar:  npm run db:permisos   (desde server/)
-- ==========================================================================

BEGIN;

-- 1) Módulos (mismo id, nombre, ícono y orden que menuConfig.js)
INSERT INTO sat.modulos (codigo, nombre, icono, orden) VALUES
  ('dashboard',       'Tablero General',                          'fa-chart-pie',        1),
  ('ficha',           'Ficha 360° Estudiante',                    'fa-address-card',     2),
  ('alertas',         'Alertas Tempranas',                        'fa-bell',             3),
  ('intervenciones',  'Intervenciones',                           'fa-clipboard-check',  4),
  ('remisiones',      'Remisiones',                               'fa-share-nodes',      5),
  ('caracterizacion', 'Formulario Caracterización (Instrumento)', 'fa-list-check',       6),
  ('reportes',        'Reportes y Exportación',                   'fa-file-arrow-down',  7),
  ('administracion',  'Usuarios y Parámetros',                    'fa-sliders',          8)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Permiso de acceso por módulo + 3) roles por defecto SOLO para los
--    permisos recién creados en esta ejecución.
WITH nuevos AS (
  INSERT INTO sat.permisos (id_modulos, codigo, nombre, descripcion)
  SELECT m.id_modulos,
         'acceso:' || m.codigo,
         'Acceso a ' || m.nombre,
         'Permite ver y usar el módulo "' || m.nombre || '".'
  FROM sat.modulos m
  WHERE m.codigo IN ('dashboard','ficha','alertas','intervenciones','remisiones',
                     'caracterizacion','reportes','administracion')
  ON CONFLICT (codigo) DO NOTHING
  RETURNING id_permisos, codigo
)
INSERT INTO sat.roles_permisos (id_roles, id_permisos)
SELECT r.id_roles, n.id_permisos
FROM nuevos n
JOIN (VALUES
  ('acceso:dashboard',       'admin'),
  ('acceso:dashboard',       'profesional'),
  ('acceso:dashboard',       'directivo'),
  ('acceso:dashboard',       'reporte_actividades'),

  ('acceso:ficha',           'admin'),
  ('acceso:ficha',           'profesional'),
  ('acceso:ficha',           'directivo'),

  ('acceso:alertas',         'admin'),
  ('acceso:alertas',         'profesional'),
  ('acceso:alertas',         'directivo'),

  ('acceso:intervenciones',  'admin'),
  ('acceso:intervenciones',  'profesional'),
  ('acceso:intervenciones',  'directivo'),

  ('acceso:remisiones',      'admin'),
  ('acceso:remisiones',      'profesional'),
  ('acceso:remisiones',      'directivo'),

  ('acceso:caracterizacion', 'admin'),
  ('acceso:caracterizacion', 'profesional'),
  ('acceso:caracterizacion', 'estudiante'),

  ('acceso:reportes',        'admin'),
  ('acceso:reportes',        'profesional'),
  ('acceso:reportes',        'directivo'),
  ('acceso:reportes',        'reporte_actividades'),

  ('acceso:administracion',  'admin')
) AS d(permiso, rol) ON d.permiso = n.codigo
JOIN sat.roles r ON r.nombre = d.rol
ON CONFLICT DO NOTHING;

-- El rol admin siempre conserva Administración (también lo garantiza la API).
INSERT INTO sat.roles_permisos (id_roles, id_permisos)
SELECT r.id_roles, p.id_permisos
FROM sat.roles r, sat.permisos p
WHERE r.nombre = 'admin' AND p.codigo = 'acceso:administracion'
ON CONFLICT DO NOTHING;

COMMIT;

-- Verificación (correr a mano en el Query Tool):
-- SELECT m.nombre AS modulo, string_agg(r.nombre, ', ' ORDER BY r.nombre) AS roles
-- FROM sat.modulos m
-- JOIN sat.permisos p ON p.id_modulos = m.id_modulos AND p.codigo = 'acceso:' || m.codigo
-- LEFT JOIN sat.roles_permisos rp ON rp.id_permisos = p.id_permisos
-- LEFT JOIN sat.roles r ON r.id_roles = rp.id_roles
-- GROUP BY m.nombre, m.orden ORDER BY m.orden;
