import { apiFetch } from "../../shared/api/client.js";

// Obtener las preguntas activas para responder la encuesta
export const getInstrumento = () => apiFetch("/caracterizacion/instrumento");

// Obtener datos detallados del estudiante (solo lectura)
export const getEstudianteInfo = (codigo) => apiFetch(`/caracterizacion/estudiante-info/${codigo}`);

// Enviar respuestas para cálculo de riesgo
export const enviarCaracterizacion = (data) => apiFetch("/caracterizacion", { method: "POST", body: data });

// Listar estudiantes para el selector
export const listEstudiantesParaSelector = () => apiFetch("/estudiantes");

// --- ENDPOINTS ADMINISTRATIVOS (Gestión de Encuesta y Preguntas) ---

// Obtener metadatos y estadísticas de la encuesta
export const getEncuestaInfo = () => apiFetch("/caracterizacion/encuesta");

// Actualizar datos generales de la encuesta
export const updateEncuesta = (id, data) =>
  apiFetch(`/caracterizacion/encuesta/${id}`, { method: "PUT", body: data });

// Listar todas las preguntas (activas e inactivas) para el administrador
export const listPreguntasAdmin = () => apiFetch("/caracterizacion/preguntas");

// Crear una nueva pregunta
export const crearPregunta = (data) =>
  apiFetch("/caracterizacion/preguntas", { method: "POST", body: data });

// Editar una pregunta existente
export const actualizarPregunta = (id, data) =>
  apiFetch(`/caracterizacion/preguntas/${id}`, { method: "PUT", body: data });

// Activar o inhabilitar una pregunta
export const togglePregunta = (id) =>
  apiFetch(`/caracterizacion/preguntas/${id}/toggle`, { method: "PATCH" });

// Eliminar pregunta
export const eliminarPregunta = (id) =>
  apiFetch(`/caracterizacion/preguntas/${id}`, { method: "DELETE" });
