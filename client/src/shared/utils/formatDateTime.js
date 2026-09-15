/* ==========================================================================
   Utilidad: formato de fecha/hora
   ==========================================================================
   Formato de hora fijo en 12h (a.m./p.m.), locale "es-CO", sin depender del
   locale por defecto del navegador.
   ========================================================================== */

export function formatTime(date) {
  return new Date(date).toLocaleTimeString("es-CO", { hour12: true });
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString("es-CO", { hour12: true });
}
