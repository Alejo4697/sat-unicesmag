import { apiFetch } from "../../shared/api/client.js";

export const listRemisiones = () => apiFetch("/remisiones");
export const crearRemision = (data) => apiFetch("/remisiones", { method: "POST", body: data });
export const actualizarRemision = (id, data) => apiFetch(`/remisiones/${id}`, { method: "PATCH", body: data });

// Ver nota en features/alertas-tempranas/api.js: se llama el endpoint
// directamente en vez de importar la feature seguimiento-estudiantil.
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");
