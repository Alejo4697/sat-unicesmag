import { readFile } from "node:fs/promises";
import { pool } from "../../shared/db/pool.js";

try {
  const sql = await readFile(
    new URL("./permisos_linea_accion.sql", import.meta.url),
    "utf8",
  );
  await pool.query(sql);
  console.log("Permisos por línea de acción aplicados.");
} catch (error) {
  console.error("No se pudieron aplicar los permisos por línea de acción:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
