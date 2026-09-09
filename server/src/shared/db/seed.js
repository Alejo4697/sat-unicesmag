/* ==========================================================================
   Runner del seed SQL - ejecuta server/src/shared/db/seed.sql contra la base
   configurada en server/.env. Útil porque no todos tienen `psql` instalado.

   Uso:  npm run db:seed   (desde server/)
   ==========================================================================
   El seed es idempotente, así que correrlo varias veces es seguro.
   ========================================================================== */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./pool.js";

const sqlPath = join(dirname(fileURLToPath(import.meta.url)), "seed.sql");

try {
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
  console.log(`✅ Seed aplicado: ${sqlPath}`);
} catch (err) {
  console.error("❌ Falló el seed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
