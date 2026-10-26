import { query } from "./src/shared/db/pool.js";

async function main() {
  const users = await query(`
    SELECT * FROM sat.usuarios
    WHERE actualizado_en > NOW() - INTERVAL '2 hours' OR creado_en > NOW() - INTERVAL '2 hours'
  `);
  console.log("Usuarios modified in last 2 hours:", users.rows.map(u => ({
    id: u.id_usuarios,
    email: u.correo_institucional,
    doc: u.numero_documento,
    nombre: `${u.nombres} ${u.apellidos}`,
    cargo: u.cargo,
    intentos: u.intentos_fallidos,
    bloqueado: u.bloqueado_hasta,
    activo: u.activo
  })));

  const docentes = await query(`
    SELECT * FROM sat.docentes
    WHERE id_usuarios IS NOT NULL
  `);
  console.log("Docentes with id_usuarios:", docentes.rows.map(d => ({
    nombre: `${d.nombres} ${d.apellidos}`,
    email: d.correo_institucional,
    doc: d.numero_documento,
    id_usuarios: d.id_usuarios
  })));

  process.exit(0);
}
main();
