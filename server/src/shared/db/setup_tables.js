import { query } from "./pool.js";

export async function setupTables() {
  try {
    // 1. Crear tabla sat.otp_codigos
    await query(`
      CREATE TABLE IF NOT EXISTS sat.otp_codigos (
        id_otp UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        id_estudiantes UUID NOT NULL REFERENCES sat.estudiantes(id_estudiantes) ON DELETE CASCADE,
        codigo VARCHAR(10) NOT NULL,
        correo_destino VARCHAR(255) NOT NULL,
        expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
        intentos_fallidos INT DEFAULT 0,
        max_intentos INT DEFAULT 5,
        usado BOOLEAN DEFAULT FALSE,
        usado_en TIMESTAMP WITH TIME ZONE,
        ip_origen VARCHAR(45),
        creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log("Tabla sat.otp_codigos verificada/creada.");

    // 2. Poblar sat.estados_caso si está vacía
    const ec = await query(`SELECT COUNT(*) FROM sat.estados_caso`);
    if (Number(ec.rows[0].count) === 0) {
      await query(`
        INSERT INTO sat.estados_caso (nombre, orden, es_final, activo) VALUES
          ('Abierto', 1, false, true),
          ('En Seguimiento', 2, false, true),
          ('Cerrado', 3, true, true)
        ON CONFLICT DO NOTHING;
      `);
      console.log("Catálogo sat.estados_caso inicializado.");
    }

    // 3. Crear índice en sat.otp_codigos para consultas rápidas
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otp_estudiantes ON sat.otp_codigos (id_estudiantes, creado_en DESC);
    `);

    console.log("Migración inicial de base de datos completada.");
  } catch (err) {
    console.error("Error al configurar tablas:", err.message);
  }
}

if (process.argv[1]?.includes("setup_tables.js")) {
  setupTables().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
