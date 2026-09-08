import { apiFetch } from "../../shared/api/client.js";

export const listIntervenciones = () => apiFetch("/intervenciones");
export const crearIntervencion = (data) => apiFetch("/intervenciones", { method: "POST", body: data });

// Ver nota en features/alertas-tempranas/api.js: se llama el endpoint
// directamente en vez de importar la feature seguimiento-estudiantil.
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");
