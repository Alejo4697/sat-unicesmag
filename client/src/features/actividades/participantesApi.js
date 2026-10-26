import { apiDownload, apiFetch } from "../../shared/api/client.js";

export function buscarParticipante({ tipo, identificacion, signal }) {
  const params = new URLSearchParams({ tipo, identificacion });
  return apiFetch(`/actividades/participantes/buscar?${params.toString()}`, {
    signal,
  });
}

export function registrarParticipante(participante) {
  return apiFetch("/actividades/participantes", {
    method: "POST",
    body: participante,
  });
}

export function getResumenParticipantes() {
  return apiFetch("/actividades/participantes/resumen");
}

export function getParticipantes({ limite = 100 } = {}) {
  const params = new URLSearchParams({ limite: String(limite) });
  return apiFetch(`/actividades/participantes?${params.toString()}`);
}

export function eliminarPersonaParticipanteDefinitivamente(
  idPerfil,
  confirmarIdentificacion,
) {
  return apiFetch(
    `/actividades/participantes/perfiles/persona/${encodeURIComponent(idPerfil)}/definitivo`,
    {
      method: "DELETE",
      body: { confirmarIdentificacion },
    },
  );
}

export function getCatalogosEstudiante({ signal } = {}) {
  return apiFetch("/actividades/participantes/catalogos-estudiante", {
    signal,
  });
}

export function getBeneficiariosApoyo({ tipoApoyo, pagina = 1, signal }) {
  const params = new URLSearchParams({ pagina: String(pagina) });
  if (tipoApoyo && tipoApoyo !== "todos") params.set("tipoApoyo", tipoApoyo);
  return apiFetch(
    `/actividades/participantes/apoyos/todos?${params.toString()}`,
    { signal },
  );
}

export function getCatalogoMaestroActividades() {
  return apiFetch("/actividades/participantes/catalogo-maestro");
}

export function getEventosProximos({ signal } = {}) {
  return apiFetch("/actividades/participantes/eventos-proximos", { signal });
}

export function getActividades({ busqueda = "", estado = "" } = {}) {
  const params = new URLSearchParams();
  if (busqueda) params.set("busqueda", busqueda);
  if (estado) params.set("estado", estado);
  return apiFetch(`/actividades/participantes/eventos?${params.toString()}`);
}

export function previsualizarImportacionActividades(payload) {
  return apiFetch(
    "/actividades/participantes/importar-realizadas/previsualizar",
    {
      method: "POST",
      body: payload,
    },
  );
}

export function confirmarImportacionActividades(payload) {
  return apiFetch("/actividades/participantes/importar-realizadas/confirmar", {
    method: "POST",
    body: payload,
  });
}

export function crearActividad(actividad) {
  return apiFetch("/actividades/participantes/eventos", {
    method: "POST",
    body: actividad,
  });
}

export function actualizarActividad(id, actividad) {
  return apiFetch(
    `/actividades/participantes/eventos/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: actividad,
    },
  );
}

export function cambiarEstadoActividad(id, estado) {
  return apiFetch(
    `/actividades/participantes/eventos/${encodeURIComponent(id)}/estado`,
    {
      method: "PATCH",
      body: { estado },
    },
  );
}

export function eliminarActividad(id) {
  return apiFetch(
    `/actividades/participantes/eventos/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function getParticipantesActividad(id) {
  return apiFetch(
    `/actividades/participantes/eventos/${encodeURIComponent(id)}/participantes`,
  );
}

export function exportarParticipantesActividad(id) {
  return apiDownload(
    `/actividades/participantes/eventos/${encodeURIComponent(id)}/participantes/exportar`,
  );
}

export function eliminarInscripcion(id) {
  return apiFetch(
    `/actividades/participantes/inscripciones/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function corregirTipoApoyoInscripcion(id, { idTipoApoyo, motivo }) {
  return apiFetch(
    `/actividades/participantes/inscripciones/${encodeURIComponent(id)}/apoyo`,
    {
      method: "PATCH",
      body: { idTipoApoyo, motivo },
    },
  );
}

export function getAuditoriaInscripcion(id) {
  return apiFetch(
    `/actividades/participantes/inscripciones/${encodeURIComponent(id)}/auditoria`,
  );
}

export function buscarPersonasActividades(termino) {
  const params = new URLSearchParams({ termino });
  return apiFetch(
    `/actividades/participantes/personas/buscar?${params.toString()}`,
  );
}

export function getHistorialParticipacion(identificacion) {
  return apiFetch(
    `/actividades/participantes/historial/${encodeURIComponent(identificacion)}`,
  );
}

export function registrarActividadEstudiante({ participante, actividad }) {
  return apiFetch("/actividades/participantes/registro-estudiante", {
    method: "POST",
    body: { participante, actividad },
  });
}

export function registrarActividad({
  participante,
  actividad,
  autorizarExcepcion,
  motivoExcepcion,
  confirmarNuevoRol = false,
}) {
  return apiFetch("/actividades/participantes/registro-actividad", {
    method: "POST",
    body: {
      participante,
      actividad,
      autorizarExcepcion,
      motivoExcepcion,
      confirmarNuevoRol,
    },
  });
}

export function validarParticipantesMasivo({ idActividad, participantes }) {
  return apiFetch(
    "/actividades/participantes/registro-actividad/validar-masivo",
    {
      method: "POST",
      body: { idActividad, participantes },
    },
  );
}

export function registrarParticipantesMasivo({ idActividad, participantes }) {
  return apiFetch("/actividades/participantes/registro-actividad/masivo", {
    method: "POST",
    body: { idActividad, participantes },
  });
}

export function registrarNoEncontradoMasivo({ idActividad, participante }) {
  return apiFetch(
    "/actividades/participantes/registro-actividad/masivo/registrar-no-encontrado",
    {
      method: "POST",
      body: { idActividad, participante },
    },
  );
}

export function validarPerfilesMasivo({ rol, participantes }) {
  return apiFetch("/actividades/participantes/perfiles/masivo/validar", {
    method: "POST",
    body: { rol, participantes },
  });
}

export function registrarPerfilesMasivo({
  rol,
  participantes,
  confirmarFilas = [],
}) {
  return apiFetch("/actividades/participantes/perfiles/masivo/registrar", {
    method: "POST",
    body: { rol, participantes, confirmarFilas },
  });
}

export function getPerfilesPorRol({ rol, busqueda = "" }) {
  const params = new URLSearchParams({ rol });
  if (busqueda) params.set("busqueda", busqueda);
  return apiFetch(
    `/actividades/participantes/perfiles/roles?${params.toString()}`,
  );
}

export function actualizarPerfilPorRol(id, perfil) {
  return apiFetch(
    `/actividades/participantes/perfiles/roles/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: perfil,
    },
  );
}

export function agregarPerfilPorRol(id, { rol, confirmarRolAdicional }) {
  return apiFetch(
    `/actividades/participantes/perfiles/roles/${encodeURIComponent(id)}/agregar`,
    {
      method: "POST",
      body: { rol, confirmarRolAdicional },
    },
  );
}

export function eliminarPerfilPorRol(
  id,
  { confirmarInscripciones = false } = {},
) {
  return apiFetch(
    `/actividades/participantes/perfiles/roles/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      body: { confirmarInscripciones },
    },
  );
}

export function getRegistrosEstudiante({ limite = 50 } = {}) {
  const params = new URLSearchParams({ limite: String(limite) });
  return apiFetch(
    `/actividades/participantes/registros-estudiante?${params.toString()}`,
  );
}

export function getActividadesDisponibles({ signal } = {}) {
  return apiFetch("/actividades/participantes/actividades-disponibles", {
    signal,
  });
}

export function getSesionesActividad({ idActividad, idPeriodo, signal }) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  return apiFetch(`/actividades/participantes/sesiones?${params.toString()}`, {
    signal,
  });
}

export function getAsistentes({
  idActividad,
  idPeriodo,
  fechaInicio,
  fechaFinalizacion,
  signal,
}) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  if (fechaInicio) params.set("fechaInicio", fechaInicio);
  if (fechaFinalizacion) params.set("fechaFinalizacion", fechaFinalizacion);
  return apiFetch(
    `/actividades/participantes/asistentes?${params.toString()}`,
    { signal },
  );
}

export function verificarAsistencia({
  idActividad,
  idPeriodo,
  fechaInicio,
  fechaFinalizacion,
  registros,
  asistenciaVerificada = true,
  asistenciaEstado,
  origen = "MANUAL",
}) {
  return apiFetch("/actividades/participantes/asistencia/verificar", {
    method: "POST",
    body: {
      idActividad,
      idPeriodo,
      fechaInicio,
      fechaFinalizacion,
      registros,
      asistenciaVerificada,
      asistenciaEstado,
      origen,
    },
  });
}

export function exportarAsistentes({
  idActividad,
  idPeriodo,
  fechaInicio,
  fechaFinalizacion,
  busqueda,
}) {
  const params = new URLSearchParams({ idActividad });
  if (idPeriodo) params.set("idPeriodo", idPeriodo);
  if (fechaInicio) params.set("fechaInicio", fechaInicio);
  if (fechaFinalizacion) params.set("fechaFinalizacion", fechaFinalizacion);
  if (busqueda) params.set("busqueda", busqueda);
  return apiDownload(
    `/actividades/participantes/exportar-asistentes?${params.toString()}`,
  );
}
