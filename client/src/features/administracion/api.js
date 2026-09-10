import { apiFetch } from "../../shared/api/client.js";

export const listUsuariosAdmin = () => apiFetch("/administracion/usuarios");
export const crearUsuarioAdmin = (data) => apiFetch("/administracion/usuarios", { method: "POST", body: data });
export const eliminarUsuarioAdmin = (id) => apiFetch(`/administracion/usuarios/${id}`, { method: "DELETE" });
export const getUmbralesRiesgo = () => apiFetch("/administracion/umbrales-riesgo");
export const actualizarUmbralesRiesgo = (data) => apiFetch("/administracion/umbrales-riesgo", { method: "PUT", body: data });
export const sincronizarAcademico = () => apiFetch("/administracion/sincronizar", { method: "POST" });
export const getMatrizPermisos = () => apiFetch("/administracion/matriz-permisos");

// Catálogos administrables (schema `sat`). Los 3 comparten la misma forma:
// listar (incluye inhabilitados), crear, editar y activar/inhabilitar.
function catalogoApi(path) {
  const base = `/administracion/${path}`;
  return {
    list: () => apiFetch(base),
    crear: (data) => apiFetch(base, { method: "POST", body: data }),
    editar: (id, data) => apiFetch(`${base}/${id}`, { method: "PUT", body: data }),
    toggle: (id, activo) => apiFetch(`${base}/${id}`, { method: "PATCH", body: { activo } })
  };
}

export const areasRemisionApi = catalogoApi("areas-remision");
export const estadosRemisionApi = catalogoApi("estados-remision");
export const tiposIntervencionApi = catalogoApi("tipos-intervencion");
