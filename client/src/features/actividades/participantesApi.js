import { apiDownload, apiFetch } from "../../shared/api/client.js";

export function buscarParticipante({ tipo, identificacion, signal }) {
  const params = new URLSearchParams({ tipo, identificacion });
  return apiFetch(`/actividades/participantes/buscar?${params.toString()}`, { signal });
}

export function registrarParticipante(participante) {
  return apiFetch("/actividades/participantes", {
    method: "POST",
    body: participante
  });
}

export function getResumenParticipantes() {
  return apiFetch("/actividades/participantes/resumen");
}

export function getParticipantes({ limite = 100 } = {}) {
  const params = new URLSearchParams({ limite: String(limite) });
  return apiFetch(`/actividades/participantes?${params.toString()}`);
}

export function getCatalogosEstudiante() {
  return apiFetch("/actividades/participantes/catalogos-estudiante");
}

export function getCatalogoApoyosFinancieros({ signal } = {}) {
  return apiFetch("/actividades/participantes/apoyos/catalogo", { signal });
}

export function getCatalogoMaestroActividades() {
  return apiFetch("/actividades/participantes/catalogo-maestro");
}

export function registrarActividadEstudiante({ participante, actividad }) {
  return apiFetch("/actividades/participantes/registro-estudiante", {
    method: "POST",
    body: { participante, actividad },
  });
}

export function registrarActividad({ participante, actividad, autorizarExcepcion, motivoExcepcion }) {
  return apiFetch("/actividades/participantes/registro-actividad", {
    method: "POST",
    body: { participante, actividad, autorizarExcepcion, motivoExcepcion },
  });
}

export function getRegistrosEstudiante({ limite = 50 } = {}) {
  const params = new URLSearchParams({ limite: String(limite) });
  return apiFetch(`/actividades/participantes/registros-estudiante?${params.toString()}`);
}

export function getActividadesDisponibles({ signal } = {}) {
  return apiFetch("/actividades/participantes/actividades-disponibles", { signal });
}

export function getListadoApoyos({ nombreApoyo, conceptoApoyo = "", idPeriodo, busqueda, pagina = 0, signal }) {
  const params = new URLSearchParams({
    nombreApoyo,
    conceptoApoyo,
    pagina: String(pagina),
  });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  if (busqueda) params.set("busqueda", busqueda);
  return apiFetch(`/actividades/participantes/apoyos/listado?${params.toString()}`, { signal });
}

export function getSesionesActividad({ idActividad, idPeriodo, signal }) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  return apiFetch(`/actividades/participantes/sesiones?${params.toString()}`, { signal });
}

export function getAsistentes({ idActividad, idPeriodo, fechaInicio, fechaFinalizacion, signal }) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  if (fechaInicio) params.set("fechaInicio", fechaInicio);
  if (fechaFinalizacion) params.set("fechaFinalizacion", fechaFinalizacion);
  return apiFetch(`/actividades/participantes/asistentes?${params.toString()}`, { signal });
}

export function verificarAsistencia({ idActividad, idPeriodo, fechaInicio, fechaFinalizacion, registros, asistenciaVerificada = true }) {
  return apiFetch("/actividades/participantes/asistencia/verificar", {
    method: "POST",
    body: { idActividad, idPeriodo, fechaInicio, fechaFinalizacion, registros, asistenciaVerificada },
  });
}

export function exportarAsistentes({ idActividad, idPeriodo, fechaInicio, fechaFinalizacion, busqueda }) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  if (fechaInicio) params.set("fechaInicio", fechaInicio);
  if (fechaFinalizacion) params.set("fechaFinalizacion", fechaFinalizacion);
  if (busqueda) params.set("busqueda", busqueda);
  return apiDownload(`/actividades/participantes/exportar-asistentes?${params.toString()}`);
}
