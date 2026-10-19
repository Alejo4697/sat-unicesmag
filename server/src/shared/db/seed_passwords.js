import bcrypt from "bcryptjs";
import { query } from "./pool.js";

async function run() {
  try {
    const passwordPorDefecto = "cesmag2026*";
    const saltRounds = 10;
    const hash = await bcrypt.hash(passwordPorDefecto, saltRounds);

    console.log(`[PASSWORDS] Generando hash bcrypt para '${passwordPorDefecto}'...`);

    // Actualizar todos los usuarios con el hash temporal y bandera debe_cambiar_password
    const res = await query(
      `UPDATE sat.usuarios
       SET password_hash = $1,
           debe_cambiar_password = true,
           intentos_fallidos = 0,
           bloqueado_hasta = NULL
       RETURNING correo_institucional, cargo`,
      [hash]
    );

    console.log(`[PASSWORDS] Se actualizaron ${res.rowCount} usuarios con contraseña temporal.`);
    
    // Limpiar duplicados en usuarios_programas si existen
    await query(`DELETE FROM sat.usuarios_programas`);
    
    // Asignar 1 solo programa representativo a cada directivo
    await query(`
      INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa)
      SELECT u.id_usuarios, p.id_programas_academicos, 'DIRECTOR'
      FROM sat.usuarios u
      JOIN (
        SELECT DISTINCT ON (nombre) id_programas_academicos, nombre 
        FROM sat.programas_academicos 
        WHERE nombre = 'Ingeniería de Sistemas'
      ) p ON true
      WHERE u.correo_institucional = 'carlos.mora@unicesmag.edu.co'
      ON CONFLICT DO NOTHING;
    `);

    await query(`
      INSERT INTO sat.usuarios_programas (id_usuarios, id_programas_academicos, rol_en_programa)
      SELECT u.id_usuarios, p.id_programas_academicos, 'COORDINADOR_ACADEMICO'
      FROM sat.usuarios u
      JOIN (
        SELECT DISTINCT ON (nombre) id_programas_academicos, nombre 
        FROM sat.programas_academicos 
        WHERE nombre = 'Psicología'
      ) p ON true
      WHERE u.correo_institucional = 'helena.pantoja@unicesmag.edu.co'
      ON CONFLICT DO NOTHING;
    `);

    console.log(`[PASSWORDS] Programas vinculados correctamente.`);
    process.exit(0);
  } catch (error) {
    console.error("[PASSWORDS] Error actualizando contraseñas:", error);
    process.exit(1);
  }
}

run();
