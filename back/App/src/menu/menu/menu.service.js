import { getMapaPermisos, menuParaRol } from "../../shared/seguridad/permisosModulos.js";

/**
 * Servicio para el menú dinámico según rol y permisos
 */
export async function obtenerMenuPorRol(rol) {
  return await menuParaRol(rol);
}

export async function obtenerMapaPermisos() {
  return await getMapaPermisos();
}
