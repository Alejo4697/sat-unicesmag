import { apiFetch } from "../../shared/api/client.js";

// Los 3 listados aceptan los filtros { periodo, programa, semestre, nivelRiesgo }.
// Se omiten los vacíos para no mandar "?programa=" sin valor.
function queryFiltros(filtros = {}) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor !== "" && valor !== null && valor !== undefined) params.set(clave, valor);
  });
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export const getReportesResumen = () => apiFetch("/reportes");
export const getOpcionesFiltros = () => apiFetch("/reportes/filtros");
export const getFilasSnies = (filtros) => apiFetch(`/reportes/snies${queryFiltros(filtros)}`);
export const getFilasIntervenciones = (filtros) => apiFetch(`/reportes/intervenciones${queryFiltros(filtros)}`);
export const getFilasRemisiones = (filtros) => apiFetch(`/reportes/remisiones${queryFiltros(filtros)}`);
