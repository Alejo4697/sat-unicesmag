import { readFile } from "node:fs/promises";
import { pool } from "../../shared/db/pool.js";

try {
  const sql = await readFile(new URL("./administracion_actividades.sql", import.meta.url), "utf8");
  const catalogoBienestar = JSON.parse(
    await readFile(new URL("./bienestarCatalogo.json", import.meta.url), "utf8"),
  ).map((item, index) => ({
    programa: item.programa,
    componente: item.componente,
    linea_accion: item.lineaAccion,
    estrategia_bienestar: item.estrategiaPoliticaBienestar,
    estrategia_permanencia: item.estrategiaPoliticaPermanencia,
    estrategia_inclusiva: item.estrategiaPoliticaEducacionInclusiva,
    numero_tipo_apoyo: Number(item.tipoApoyoExcel?.match(/Apoyo\s+(\d+)/i)?.[1]) || null,
    tipo_apoyo_excel: item.tipoApoyoExcel || null,
    orden_excel: index + 1,
  }));
  const tiposApoyo = [...new Map(catalogoBienestar
    .filter((item) => item.numero_tipo_apoyo && item.tipo_apoyo_excel)
    .map((item) => [
      item.numero_tipo_apoyo,
      {
        numero: item.numero_tipo_apoyo,
        nombre: item.tipo_apoyo_excel.replace(/^Apoyo\s+\d+:\s*/i, "").replace(/\.$/, ""),
      },
    ])).values()];
  await pool.query(
    `INSERT INTO sat.tipos_apoyo (numero, nombre)
     SELECT numero, nombre
     FROM jsonb_to_recordset($1::jsonb) AS item(numero smallint, nombre varchar(120))
     ON CONFLICT (numero) DO NOTHING`,
    [JSON.stringify(tiposApoyo)],
  );
  await pool.query(sql);
  await pool.query(
    `INSERT INTO sat.apoyos_actividades_vec (id_tipos_apoyo, numero, nombre)
     SELECT ta.id_tipos_apoyo, item.numero, item.nombre
     FROM jsonb_to_recordset($1::jsonb) AS item(numero smallint, nombre varchar(120))
     JOIN sat.tipos_apoyo ta ON ta.numero = item.numero
     ON CONFLICT (numero) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       activo = true,
       actualizado_en = now()`,
    [JSON.stringify(tiposApoyo)],
  );
  await pool.query(
  `INSERT INTO sat.catalogo_bienestar_actividades (
     programa, componente, linea_accion, estrategia_politica_bienestar,
     estrategia_politica_permanencia, estrategia_politica_educacion_inclusiva,
     numero_tipo_apoyo, tipo_apoyo_excel, orden_excel
   )
   SELECT programa, componente, linea_accion, estrategia_bienestar,
          estrategia_permanencia, estrategia_inclusiva, numero_tipo_apoyo,
          tipo_apoyo_excel, orden_excel
   FROM jsonb_to_recordset($1::jsonb) AS item(
     programa text, componente text, linea_accion text,
     estrategia_bienestar text, estrategia_permanencia text,
     estrategia_inclusiva text, numero_tipo_apoyo smallint,
     tipo_apoyo_excel varchar(200), orden_excel integer
   )
     ON CONFLICT (programa) DO UPDATE SET
       componente=EXCLUDED.componente,
       linea_accion=EXCLUDED.linea_accion,
       estrategia_politica_bienestar=EXCLUDED.estrategia_politica_bienestar,
       estrategia_politica_permanencia=EXCLUDED.estrategia_politica_permanencia,
       estrategia_politica_educacion_inclusiva=EXCLUDED.estrategia_politica_educacion_inclusiva,
       numero_tipo_apoyo=EXCLUDED.numero_tipo_apoyo,
       tipo_apoyo_excel=EXCLUDED.tipo_apoyo_excel,
       orden_excel=EXCLUDED.orden_excel,
       actualizado_en=now()`,
    [JSON.stringify(catalogoBienestar)],
  );
  await pool.query(
    `INSERT INTO sat.actividades_vec_modalidades (
       id_actividades_vec, programa, id_tipos_apoyo
     )
     SELECT a.id_actividades_vec,
            modalidad.programa,
            apoyo.id_tipos_apoyo
     FROM sat.actividades_vec a
     CROSS JOIN LATERAL unnest(
       COALESCE(a.variables_modalidades, ARRAY[]::text[])
     ) AS modalidad(programa)
     LEFT JOIN sat.catalogo_bienestar_actividades bienestar
       ON bienestar.programa = modalidad.programa
     LEFT JOIN LATERAL (
       SELECT aa.id_tipos_apoyo
       FROM sat.apoyos_actividades_vec aa
       WHERE aa.activo = true
         AND aa.numero = bienestar.numero_tipo_apoyo
       ORDER BY aa.id_tipos_apoyo
       LIMIT 1
     ) apoyo ON true
     ON CONFLICT (id_actividades_vec, programa) DO UPDATE SET
       id_tipos_apoyo = EXCLUDED.id_tipos_apoyo`,
  );
  const apoyoEspacioAcademico = await pool.query(
    `SELECT aa.id_tipos_apoyo
     FROM sat.catalogo_bienestar_actividades bienestar
     JOIN sat.apoyos_actividades_vec aa
       ON aa.numero = bienestar.numero_tipo_apoyo
      AND aa.activo = true
     WHERE bienestar.programa = $1
       AND bienestar.numero_tipo_apoyo = 9`,
    ["Itinerario franciscano para la vida universitaria - Electiva"],
  );
  if (!apoyoEspacioAcademico.rows[0]) {
    throw new Error("El apoyo 9 no quedó activo y asociado a la modalidad Electiva.");
  }
  console.log("Migración aplicada. Apoyo 9 activo y asociado a la modalidad Electiva.");
} catch (error) {
  console.error("No se pudo aplicar la migración de actividades:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
