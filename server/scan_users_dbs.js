import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function scanDbs() {
  const host = process.env.ACADEMIC_DB_HOST;
  const user = process.env.ACADEMIC_DB_USER;
  const password = process.env.ACADEMIC_DB_PASSWORD;

  if (!host || !user || !password) {
    console.error("Configure las variables ACADEMIC_DB_* en server/.env para ejecutar este script de diagnóstico.");
    return;
  }

  const dbs = [
    "prod18sep2",
    "prod23sep",
    "prod18sep",
    "bienestau",
    "prodpracticas",
    "practicaspmo27ago"
  ];

  for (const db of dbs) {
    const client = new Client({
      host,
      port: Number(process.env.ACADEMIC_DB_PORT) || 5432,
      database: db,
      user,
      password
    });

    try {
      await client.connect();
      const tables = await client.query(`
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND (table_name ILIKE '%user%' OR table_name ILIKE '%usuario%' OR table_name ILIKE '%personal%' OR table_name ILIKE '%docente%')
      `);
      console.log(`[${db}] Tablas encontradas:`, tables.rows);
      await client.end();
    } catch (e) {
      console.log(`[${db}] No se pudo conectar: ${e.message}`);
      await client.end().catch(() => {});
    }
  }
}

scanDbs();
