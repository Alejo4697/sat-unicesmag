import { pool } from "../../../../database/pool.js";

const INTERVALO_LIMPIEZA_MS = 24 * 60 * 60 * 1000;
const RETENCION_DIAS = 30;
const TAMANO_LOTE = 250;
const BLOQUEO_LIMPIEZA_ID = 731202611;

let limpiezaEnProgreso = false;
let intervaloTimer = null;
let inicioTimer = null;

function ejecutarLimpiezaProgramada() {
  eliminarActividadesCanceladasVencidas().catch((error) => {
    console.error("[LimpiezaActividades] Falló la ejecución programada:", error.message);
  });
}

export async function eliminarActividadesCanceladasVencidas() {
  if (limpiezaEnProgreso) return;
  limpiezaEnProgreso = true;

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const { rows: lockRows } = await client.query(
      "SELECT pg_try_advisory_xact_lock($1::bigint) AS adquirido",
      [BLOQUEO_LIMPIEZA_ID],
    );
    if (!lockRows[0]?.adquirido) {
      await client.query("ROLLBACK");
      console.log("[LimpiezaActividades] Omitida: otra instancia ya está ejecutando la purga.");
      return;
    }

    let totalEliminadas = 0;
    while (true) {
      const { rows } = await client.query(
        `WITH vencidas AS (
           SELECT id_actividades_vec
           FROM sat.actividades_vec
           WHERE estado = 'CANCELADA'
             AND cancelada_en <= now() - ($1::int * interval '1 day')
           ORDER BY cancelada_en, id_actividades_vec
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         DELETE FROM sat.actividades_vec actividad
         USING vencidas
         WHERE actividad.id_actividades_vec = vencidas.id_actividades_vec
         RETURNING actividad.id_actividades_vec`,
        [RETENCION_DIAS, TAMANO_LOTE],
      );
      totalEliminadas += rows.length;
      if (rows.length < TAMANO_LOTE) break;
    }

    await client.query("COMMIT");
    console.log(
      `[LimpiezaActividades] Purga diaria completada: ${totalEliminadas} actividades canceladas eliminadas (retención: ${RETENCION_DIAS} días).`,
    );
    return totalEliminadas;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    limpiezaEnProgreso = false;
  }
}

export function iniciarLimpiezaActividadesCanceladas() {
  if (intervaloTimer) return;

  console.log(
    `[LimpiezaActividades] Servicio activo; revisión diaria y eliminación tras ${RETENCION_DIAS} días cancelada.`,
  );
  inicioTimer = setTimeout(() => {
    ejecutarLimpiezaProgramada();
  }, 5000);
  intervaloTimer = setInterval(() => {
    ejecutarLimpiezaProgramada();
  }, INTERVALO_LIMPIEZA_MS);

  return {
    detener() {
      if (inicioTimer) clearTimeout(inicioTimer);
      if (intervaloTimer) clearInterval(intervaloTimer);
      inicioTimer = null;
      intervaloTimer = null;
    },
  };
}
