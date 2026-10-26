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

    // 4. Asegurar tabla sat.usuarios_programas para asignación de programas
    await query(`
      CREATE TABLE IF NOT EXISTS sat.usuarios_programas (
        id_usuarios UUID NOT NULL REFERENCES sat.usuarios(id_usuarios) ON DELETE CASCADE,
        id_programas_academicos UUID NOT NULL REFERENCES sat.programas_academicos(id_programas_academicos) ON DELETE CASCADE,
        rol_en_programa VARCHAR DEFAULT 'DIRECTIVO',
        asignado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id_usuarios, id_programas_academicos)
      );
    `);

    // 5. Asegurar columnas en sat.docentes para enlace con usuarios y código
    await query(`
      ALTER TABLE sat.docentes ADD COLUMN IF NOT EXISTS id_usuarios UUID REFERENCES sat.usuarios(id_usuarios) ON DELETE SET NULL;
      ALTER TABLE sat.docentes ADD COLUMN IF NOT EXISTS codigo_externo VARCHAR;
    `);

    // 6. Actualizar rol de Docentes Acompañantes a 'profesional' según requerimiento
    await query(`
      UPDATE sat.usuarios_roles
      SET id_roles = (SELECT id_roles FROM sat.roles WHERE nombre = 'profesional')
      WHERE id_usuarios IN (
        SELECT id_usuarios FROM sat.usuarios
        WHERE cargo ILIKE '%docente%acompañante%' OR correo_institucional = 'docente.acompanante@unicesmag.edu.co'
      )
      AND id_roles = (SELECT id_roles FROM sat.roles WHERE nombre = 'directivo');
    `);

    console.log("Migración inicial de base de datos completada.");
  } catch (err) {
    console.error("Error al configurar tablas:", err.message);
  }
}

if (process.argv[1]?.includes("setup_tables.js")) {
  setupTables().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
