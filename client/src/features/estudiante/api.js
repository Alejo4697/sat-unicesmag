/* ==========================================================================
   Feature: Estudiante - Cliente API
   ========================================================================== */

import { apiFetch } from "../../shared/api/client.js";

/**
 * Solicita el código OTP de 6 dígitos enviando documento y correo institucional.
 */
export async function solicitarOtp({ documento, correo }) {
  return apiFetch("/estudiante/solicitar-otp", {
    method: "POST",
    body: { documento, correo }
  });
}

/**
 * Valida el código OTP de 6 dígitos e inicia la sesión de estudiante.
 */
export async function verificarOtp({ documento, correo, codigo }) {
  return apiFetch("/estudiante/verificar-otp", {
    method: "POST",
    body: { documento, correo, codigo }
  });
}

/**
 * Consulta el estado de elegibilidad (semestres 1, 4, 7) y encuesta completada.
 */
export async function getEstadoEstudiante() {
  return apiFetch("/estudiante/estado");
}

/**
 * Obtiene las 34 preguntas activas del instrumento oficial.
 */
export async function getInstrumentoPreguntas() {
  return apiFetch("/caracterizacion/instrumento");
}

/**
 * Guarda y evalúa las respuestas de la caracterización institucional.
 */
export async function guardarEncuestaEstudiante({ respuestas }) {
  return apiFetch("/estudiante/guardar-encuesta", {
    method: "POST",
    body: { respuestas }
  });
}
