import { apiFetch } from "@services/apiClient.js";

export const listEstudiantes = (q = "") => apiFetch(`/estudiantes${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getEstudiante = (codigo) => apiFetch(`/estudiantes/${codigo}`);
export const getTimeline = (codigo) => apiFetch(`/estudiantes/${codigo}/timeline`);
export const getCaracterizacionesEstudiante = (codigo) => apiFetch(`/caracterizacion/${codigo}`);
