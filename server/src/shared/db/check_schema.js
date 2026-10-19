import { query } from "./pool.js";

async function main() {
  await query(`
    INSERT INTO sat.modulos (codigo, nombre, icono, orden, activo)
    VALUES ('actividades', 'Registro de Actividades VEC', 'fa-calendar-check', 9, true)
    ON CONFLICT (codigo) DO NOTHING;

    INSERT INTO sat.permisos (id_modulos, codigo, nombre, descripcion, activo)
    SELECT m.id_modulos, 'acceso:actividades', 'Acceso a Actividades VEC', 'Permite ver y registrar Actividades VEC', true
    FROM sat.modulos m
    WHERE m.codigo = 'actividades'
    ON CONFLICT (codigo) DO NOTHING;

    INSERT INTO sat.roles_permisos (id_roles, id_permisos)
    SELECT r.id_roles, p.id_permisos
    FROM sat.roles r, sat.permisos p
    WHERE r.nombre IN ('admin', 'reporte_actividades')
      AND p.codigo = 'acceso:actividades'
    ON CONFLICT DO NOTHING;
  `);

  console.log("Módulo actividades y permisos agregados exitosamente.");
  process.exit(0);
}

main().catch(console.error);
