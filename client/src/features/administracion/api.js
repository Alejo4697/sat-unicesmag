import { apiFetch } from "../../shared/api/client.js";

export const listUsuariosAdmin = () => apiFetch("/administracion/usuarios");
export const crearUsuarioAdmin = (data) => apiFetch("/administracion/usuarios", { method: "POST", body: data });
export const eliminarUsuarioAdmin = (id) => apiFetch(`/administracion/usuarios/${id}`, { method: "DELETE" });
export const getUmbralesRiesgo = () => apiFetch("/administracion/umbrales-riesgo");
export const actualizarUmbralesRiesgo = (data) => apiFetch("/administracion/umbrales-riesgo", { method: "PUT", body: data });
export const sincronizarAcademico = () => apiFetch("/administracion/sincronizar", { method: "POST" });
export const getMatrizPermisos = () => apiFetch("/administracion/matriz-permisos");
