import { apiFetch } from "../../shared/api/client.js";

export const getInstrumento = () => apiFetch("/caracterizacion/instrumento");
export const enviarCaracterizacion = (data) => apiFetch("/caracterizacion", { method: "POST", body: data });

// Ver nota en features/alertas-tempranas/api.js: se llama el endpoint
// directamente en vez de importar la feature seguimiento-estudiantil.
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");
