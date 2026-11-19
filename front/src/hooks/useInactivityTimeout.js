/* ==========================================================================
   Hook genérico de cierre por inactividad: arranca un temporizador que se
   reinicia con cualquier interacción del usuario (click, movimiento de
   mouse, tecla, scroll, touch) y ejecuta `onTimeout` si no hay actividad
   durante `timeoutMs`. No sabe nada de sesión/auth - eso lo decide quien
   lo usa (ver AuthContext.jsx).
   ========================================================================== */

import { useEffect, useRef } from "react";

const EVENTOS_ACTIVIDAD = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];

/**
 * @param {boolean} activo - si false, no arranca ningún temporizador ni escucha eventos.
 * @param {number} timeoutMs - milisegundos de inactividad antes de disparar onTimeout.
 * @param {() => void} onTimeout - callback al cumplirse el umbral.
 */
export function useInactivityTimeout(activo, timeoutMs, onTimeout) {
  const timerRef = useRef(null);
  // Guarda siempre la última versión de onTimeout sin forzar que el efecto
  // de abajo se vuelva a suscribir en cada render (evita quitar/poner los
  // listeners del documento por cada cambio de identidad de la función).
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!activo) return;

    function reiniciarTemporizador() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onTimeoutRef.current(), timeoutMs);
    }

    reiniciarTemporizador();
    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, reiniciarTemporizador));

    return () => {
      clearTimeout(timerRef.current);
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, reiniciarTemporizador));
    };
  }, [activo, timeoutMs]);
}
