import { apiFetch } from "../../shared/api/client.js";

export const listAlertas = () => apiFetch("/alertas");
export const crearAlerta = (data) => apiFetch("/alertas", { method: "POST", body: data });

// Llama directo a /estudiantes (dueño del endpoint: seguimiento-estudiantil)
// en vez de importar features/seguimiento-estudiantil/api.js — las
// features nunca se importan entre sí, solo comparten el contrato REST.
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");
