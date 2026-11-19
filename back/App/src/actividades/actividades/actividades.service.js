import { pool, query } from "../../../../database/pool.js";
import { sincronizarEgresadosInstitucionales } from "../shared/egresadosSync.service.js";
import { sincronizarAdministrativosInstitucionales } from "../shared/administrativosSync.service.js";
import { ejecutarSincronizacion } from "../../shared/sincronizacion/sincronizacion.service.js";

/**
 * Servicio de Actividades de Bienestar Institucional
 */
export async function sincronizarPerfilesCompletos() {
  const institucional = await ejecutarSincronizacion();
  const egresados = await sincronizarEgresadosInstitucionales();
  const administrativos = await sincronizarAdministrativosInstitucionales();

  return {
    ok: true,
    institucional,
    egresados,
    administrativos
  };
}

export async function sincronizarEgresados() {
  return await sincronizarEgresadosInstitucionales();
}

export async function sincronizarAdministrativos() {
  return await sincronizarAdministrativosInstitucionales();
}

export async function sincronizarInstitucional() {
  return await ejecutarSincronizacion();
}

export async function obtenerResumenActividades(filtros = {}) {
  const { rows } = await query(`
    SELECT 
      COUNT(*) AS total_actividades,
      COUNT(DISTINCT linea_accion) AS lineas_activas
    FROM sat.actividades_vec
  `);
  return rows[0] || { total_actividades: 0, lineas_activas: 0 };
}
