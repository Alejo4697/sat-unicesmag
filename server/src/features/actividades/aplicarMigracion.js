import { readFile } from "node:fs/promises";
import { pool } from "../../shared/db/pool.js";

try {
  const sql = await readFile(new URL("./administracion_actividades.sql", import.meta.url), "utf8");
  await pool.query(sql);
  const catalogoBienestar = JSON.parse(
    await readFile(new URL("./bienestarCatalogo.json", import.meta.url), "utf8"),
  ).map((item) => ({
    programa: item.programa,
    componente: item.componente,
    lineaAccion: item.lineaAccion,
    estrategiaBienestar: item.estrategiaPoliticaBienestar,
    estrategiaPermanencia: item.estrategiaPoliticaPermanencia,
    estrategiaInclusiva: item.estrategiaPoliticaEducacionInclusiva,
    numeroTipoApoyo: Number(item.tipoApoyoExcel?.match(/Apoyo\s+(\d+)/i)?.[1]) || null,
  }));
  await pool.query(
    `INSERT INTO sat.catalogo_bienestar_actividades (
       programa, componente, linea_accion, estrategia_politica_bienestar,
       estrategia_politica_permanencia, estrategia_politica_educacion_inclusiva,
       numero_tipo_apoyo
     )
     SELECT programa, componente, linea_accion, estrategia_bienestar,
            estrategia_permanencia, estrategia_inclusiva, numero_tipo_apoyo
     FROM jsonb_to_recordset($1::jsonb) AS item(
       programa text, componente text, linea_accion text,
       estrategia_bienestar text, estrategia_permanencia text,
       estrategia_inclusiva text, numero_tipo_apoyo smallint
     )
     ON CONFLICT (programa) DO UPDATE SET
       componente=EXCLUDED.componente,
       linea_accion=EXCLUDED.linea_accion,
       estrategia_politica_bienestar=EXCLUDED.estrategia_politica_bienestar,
       estrategia_politica_permanencia=EXCLUDED.estrategia_politica_permanencia,
       estrategia_politica_educacion_inclusiva=EXCLUDED.estrategia_politica_educacion_inclusiva,
       numero_tipo_apoyo=EXCLUDED.numero_tipo_apoyo,
       actualizado_en=now()`,
    [JSON.stringify(catalogoBienestar)],
  );
  console.log("Migración de administración de actividades aplicada correctamente.");
} catch (error) {
  console.error("No se pudo aplicar la migración de actividades:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
