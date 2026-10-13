/* ==========================================================================
   SAT-UNICESMAG - Sincronizador Automático en Segundo Plano
   ==========================================================================
   Monitorea la base de datos institucional remota (prod18sep2) y sincroniza
   automáticamente hacia DataBasePractica cuando:
   1. Se detectan nuevas vistas en prod18sep2 (ej. vista_facultades, vista_docentes).
   2. De forma periódica (cada N minutos programados) para actualizar estados,
      notas, matrículas y registros.
   ========================================================================== */

import { ejecutarSincronizacion } from "./syncService.js";
import pg from "pg";

const { Client } = pg;

let syncEnProgreso = false;
let intervaloTimer = null;
let vistasConocidas = new Set();

/**
 * Consulta las vistas actualmente disponibles en prod18sep2
 */
async function obtenerVistasRemotas() {
  const client = new Client({
    host: process.env.ACADEMIC_DB_HOST || "10.10.192.7",
    port: Number(process.env.ACADEMIC_DB_PORT) || 5432,
    database: process.env.ACADEMIC_DB_NAME || "prod18sep2",
    user: process.env.ACADEMIC_DB_USER || "pruebas_adviser",
    password: process.env.ACADEMIC_DB_PASSWORD || "REDACTED_PASSWORD"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'VIEW';
    `);
    return new Set(res.rows.map((r) => r.table_name.toLowerCase()));
  } catch (err) {
    console.warn("[AutoSync] No se pudo conectar temporalmente a prod18sep2 para verificar vistas:", err.message);
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Ejecuta la sincronización con control de concurrencia
 */
export async function sincronizarSiNoEstaActivo(motivo = "Programado") {
  if (syncEnProgreso) {
    console.log(`[AutoSync] Sincronización omitida (${motivo}): ya hay un proceso en ejecución.`);
    return;
  }

  syncEnProgreso = true;
  console.log(`\n[AutoSync] Disparando sincronización automática [Motivo: ${motivo}]...`);
  try {
    const res = await ejecutarSincronizacion();
    console.log(`[OK] [AutoSync] Sincronización completada exitosamente (${res.duracionSegundos}s, ${res.totalProcesados} registros).`);
    return res;
  } catch (err) {
    console.error(`[ERROR] [AutoSync] Error en sincronización automática:`, err.message);
  } finally {
    syncEnProgreso = false;
  }
}

/**
 * Inicia el temporizador de sincronización automática continua
 */
export function iniciarSincronizadorAutomatico(intervaloMinutos = 30) {
  const ms = Math.max(intervaloMinutos, 5) * 60 * 1000;
  console.log(`[AutoSync] Servicio de sincronización automática activo cada ${intervaloMinutos} minutos.`);

  // Verificación inicial después de 3 segundos del arranque del servidor
  setTimeout(async () => {
    const vistasActuales = await obtenerVistasRemotas();
    if (vistasActuales) {
      vistasConocidas = vistasActuales;
      console.log(`[AutoSync] Vistas registradas inicialmente en prod18sep2:`, [...vistasConocidas].join(", "));
    }
    // Sincronizar al iniciar para garantizar que DataBasePractica esté actualizada
    await sincronizarSiNoEstaActivo("Arranque del Servidor");
  }, 3000);

  // Intervalo recurrente en segundo plano
  intervaloTimer = setInterval(async () => {
    const vistasActuales = await obtenerVistasRemotas();
    if (!vistasActuales) return;

    // Detectar si aparecieron nuevas vistas
    let hayNuevasVistas = false;
    for (const v of vistasActuales) {
      if (!vistasConocidas.has(v)) {
        console.log(`[AutoSync] ¡NUEVA VISTA DETECTADA EN PROD18SEP2! -> [${v}]`);
        hayNuevasVistas = true;
      }
    }

    vistasConocidas = vistasActuales;

    if (hayNuevasVistas) {
      await sincronizarSiNoEstaActivo("Nueva vista detectada en prod18sep2");
    } else {
      await sincronizarSiNoEstaActivo("Intervalo Periódico");
    }
  }, ms);

  return {
    detener: () => {
      if (intervaloTimer) clearInterval(intervaloTimer);
      console.log("[AutoSync] Servicio de sincronización automática detenido.");
    }
  };
}
