import { apiFetch } from "../../shared/api/client.js";

export const getDashboardStats = () => apiFetch("/dashboard");
export const getRiesgoPorDimensiones = () => apiFetch("/dashboard/riesgo-dimensiones");
export const getNotificacionesCasos = () => apiFetch("/dashboard/notificaciones");

export const getResultadosCaracterizacion = (params = {}) => {
  const query = new URLSearchParams();
  if (params.periodo && params.periodo !== "todos") query.set("periodo", params.periodo);
  if (params.semestre && params.semestre !== "todos") query.set("semestre", params.semestre);
  if (params.campo && params.campo !== "todos") query.set("campo", params.campo);
  if (params.programa && params.programa !== "todos") query.set("programa", params.programa);
  if (params.q) query.set("q", params.q);

  const qs = query.toString();
  return apiFetch(`/dashboard/resultados-caracterizacion${qs ? `?${qs}` : ""}`);
};
