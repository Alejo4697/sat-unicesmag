import { readFile } from "node:fs/promises";
import { pool } from "../../shared/db/pool.js";

const expectedActivitiesBySheet = new Map([
  ["Trabajo social", 32],
  ["Acompañamiento", 54],
  ["Dllo humano y salud", 51],
  ["Capellania", 6],
  ["Deporte y cultura", 98],
]);

const sourcePath = new URL("./catalogo_actividades.json", import.meta.url);
const records = JSON.parse(await readFile(sourcePath, "utf8"));
const activities = records.filter((record) => record.tipo_registro === "ACTIVIDAD");
const notes = records.filter((record) => record.tipo_registro === "NOTA");

if (records.length !== 242 || activities.length !== 241 || notes.length !== 1) {
  throw new Error(
    `Conteo del archivo inesperado: ${activities.length} actividades, ${notes.length} notas, ${records.length} filas.`
  );
}

for (const [sheet, expectedCount] of expectedActivitiesBySheet) {
  const count = activities.filter((record) => record.hoja_origen === sheet).length;
  if (count !== expectedCount) {
    throw new Error(`La hoja "${sheet}" tiene ${count} actividades; se esperaban ${expectedCount}.`);
  }
}

if (records.some((record) => !record.hoja_origen || !Number.isInteger(record.fila_origen))) {
  throw new Error("Cada fila importada debe incluir la hoja y la fila Excel de origen.");
}
if (activities.some((record) => !record.actividad?.trim())) {
  throw new Error("Hay filas de actividad sin nombre; se canceló la importación.");
}

const nullableText = (value) => {
  if (typeof value !== "string") return null;
  return value.trim() || null;
};

let client;
try {
  client = await pool.connect();
  await client.query("BEGIN");

  for (const record of records) {
    await client.query(
      `INSERT INTO sat.catalogo_actividades_vec (
         hoja_origen, fila_origen, tipo_registro, actividad, nota_origen,
         descripcion, tipo_actividad, proyecto, programa, componente, linea_accion
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (hoja_origen, fila_origen) DO UPDATE SET
         tipo_registro = EXCLUDED.tipo_registro,
         actividad = EXCLUDED.actividad,
         nota_origen = EXCLUDED.nota_origen,
         descripcion = EXCLUDED.descripcion,
         tipo_actividad = EXCLUDED.tipo_actividad,
         proyecto = EXCLUDED.proyecto,
         programa = EXCLUDED.programa,
         componente = EXCLUDED.componente,
         linea_accion = EXCLUDED.linea_accion`,
      [
        record.hoja_origen,
        record.fila_origen,
        record.tipo_registro,
        nullableText(record.actividad),
        nullableText(record.nota_origen),
        nullableText(record.descripcion),
        nullableText(record.tipo_actividad),
        nullableText(record.proyecto),
        nullableText(record.programa),
        nullableText(record.componente),
        nullableText(record.linea_accion),
      ]
    );
  }

  const { rows } = await client.query(
    `SELECT hoja_origen,
            COUNT(*) FILTER (WHERE tipo_registro = 'ACTIVIDAD')::int AS actividades,
            COUNT(*) FILTER (WHERE tipo_registro = 'NOTA')::int AS notas
     FROM sat.catalogo_actividades_vec
     WHERE hoja_origen = ANY($1::text[])
     GROUP BY hoja_origen`,
    [[...expectedActivitiesBySheet.keys()]]
  );
  const loaded = new Map(rows.map((row) => [row.hoja_origen, row]));

  for (const [sheet, expectedActivities] of expectedActivitiesBySheet) {
    const actual = loaded.get(sheet);
    const expectedNotes = sheet === "Trabajo social" ? 1 : 0;
    if (
      !actual
      || actual.actividades !== expectedActivities
      || actual.notas !== expectedNotes
    ) {
      throw new Error(
        `Conteo persistido inesperado en "${sheet}": ${JSON.stringify(actual)}. ` +
        "No se eliminó ningún registro preexistente; la transacción se revertirá."
      );
    }
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({
    importedActivities: activities.length,
    preservedNotes: notes.length,
    sheets: rows,
    sourceRowsWithMissingComponent: activities.filter((record) => !record.componente).length,
  }, null, 2));
} catch (error) {
  if (client) await client.query("ROLLBACK");
  throw error;
} finally {
  client?.release();
  await pool.end();
}
