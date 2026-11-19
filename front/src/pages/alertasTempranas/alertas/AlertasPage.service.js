import { apiFetch } from "@services/apiClient.js";

export const listAlertas = () => apiFetch("/alertas");
export const crearAlerta = (data) => apiFetch("/alertas", { method: "POST", body: data });
export const getEstudiante = (id) => apiFetch(`/estudiantes/${encodeURIComponent(id)}`);
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");

