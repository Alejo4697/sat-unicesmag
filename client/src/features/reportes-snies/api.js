import { apiFetch } from "../../shared/api/client.js";

export const getReportesResumen = () => apiFetch("/reportes");
export const getFilasSnies = () => apiFetch("/reportes/snies");
export const getFilasIntervenciones = () => apiFetch("/reportes/intervenciones");
export const getFilasRemisiones = () => apiFetch("/reportes/remisiones");
