/* ==========================================================================
   Runner de scripts SQL - ejecuta un archivo de back/database/scripts/ contra
   la base configurada en back/.env. Ãštil porque no todos tienen `psql`.

   Uso:  npm run db:seed                 -> *_seed.sql
         node database/seed.js <nombre>  -> busca <nombre> (con o sin fecha)
   El seed es idempotente, asÃ­ que correrlo varias veces es seguro.
   ========================================================================== */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./pool.js";

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "scripts");
const nombre = process.argv[2] || "seed.sql";

async function resolverScript(nombreBuscado) {
  const archivos = await readdir(SCRIPTS_DIR);
  return (
    archivos.find((a) => a === nombreBuscado) ||
    archivos.find((a) => a.replace(/^\d{8}_/, "") === nombreBuscado)
  );
}

try {
  const archivo = await resolverScript(nombre);
  if (!archivo) throw new Error(`No existe el script ${nombre} en database/scripts`);
  const sqlPath = join(SCRIPTS_DIR, archivo);
  await pool.query(await readFile(sqlPath, "utf8"));
  console.log(`[OK] Script aplicado: ${sqlPath}`);
} catch (err) {
  console.error("[ERROR] FallÃ³ el script:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
