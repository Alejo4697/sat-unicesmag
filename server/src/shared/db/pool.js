/* ==========================================================================
   SAT-UNICESMAG - Pool de conexión PostgreSQL
   ==========================================================================
   Infraestructura transversal (shared/, no features/): un único pool de
   conexiones `pg` para todo el servidor, configurado desde server/.env
   (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).

   Hoy solo la feature `administracion` consulta contra este pool; el resto
   sigue usando MOCK_DATA a propósito. A medida que se migren más features,
   todas comparten este mismo pool (no se crea uno por feature).
   ========================================================================== */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Un error en un cliente inactivo del pool (ej. corte de red con Postgres)
// emite 'error' a nivel de pool; sin este listener, Node tumba el proceso.
pool.on("error", (err) => {
  console.error("Error inesperado en un cliente inactivo del pool de PostgreSQL", err);
});

/**
 * Envuelve pool.query() para que las features no importen `pg` directamente.
 * @param {string} text  - SQL con placeholders posicionales ($1, $2, ...).
 * @param {unknown[]} [params] - valores para esos placeholders.
 * @returns {Promise<import("pg").QueryResult>}
 */
export function query(text, params) {
  return pool.query(text, params);
}
