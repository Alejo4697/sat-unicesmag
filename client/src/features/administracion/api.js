import { apiFetch } from "../../shared/api/client.js";

export const listUsuariosAdmin = (params = {}) => {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.tipo) query.set("tipo", params.tipo);
  const qStr = query.toString();
  return apiFetch(`/administracion/usuarios${qStr ? `?${qStr}` : ""}`);
};

export const crearUsuarioAdmin = (data) => apiFetch("/administracion/usuarios", { method: "POST", body: data });
export const eliminarUsuarioAdmin = (id) => apiFetch(`/administracion/usuarios/${id}`, { method: "DELETE" });
export const getProgramasAcademicos = () => apiFetch("/administracion/programas");
export const getCargosCatalogo = () => apiFetch("/administracion/cargos-catalogo");
export const gestionarAccesoUsuario = (data) => apiFetch("/administracion/usuarios/gestionar-acceso", { method: "POST", body: data });
export const toggleEstadoUsuario = (id) => apiFetch(`/administracion/usuarios/${id}/toggle-estado`, { method: "PATCH" });
export const resetPasswordUsuario = (id) => apiFetch(`/administracion/usuarios/${id}/reset-password`, { method: "POST" });

export const getUmbralesRiesgo = () => apiFetch("/administracion/umbrales-riesgo");
export const actualizarUmbralesRiesgo = (data) => apiFetch("/administracion/umbrales-riesgo", { method: "PUT", body: data });
export const sincronizarAcademico = () => apiFetch("/administracion/sincronizar", { method: "POST" });
export const getEstadoSincronizacion = () => apiFetch("/administracion/estado-sincronizacion");
export const getMatrizPermisos = () => apiFetch("/administracion/matriz-permisos");
// { modulo, rol, permitido } -> { modulo, roles }
export const actualizarPermisoModulo = (data) =>
  apiFetch("/administracion/matriz-permisos", { method: "PUT", body: data });

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
