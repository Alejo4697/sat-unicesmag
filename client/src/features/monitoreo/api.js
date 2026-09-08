import { apiFetch } from "../../shared/api/client.js";

export const getDashboardStats = () => apiFetch("/dashboard");
export const getRiesgoPorDimensiones = () => apiFetch("/dashboard/riesgo-dimensiones");
