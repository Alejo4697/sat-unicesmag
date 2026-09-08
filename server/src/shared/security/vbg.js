/* ==========================================================================
   Regla de Secreto Profesional & Confidencialidad (RNF01)
   Vive en shared/ (no en una sola feature) porque la usan varias:
   alertas-tempranas, intervenciones y seguimiento-estudiantil (la línea de
   tiempo de la Ficha 360° reutiliza exactamente la misma sanitización que
   ya aplica el listado de intervenciones).
   ========================================================================== */

import { puedeVerDetalleVBG } from "../data/mockData.js";

export { puedeVerDetalleVBG };

// Cada función agrega `detalleVisible` para que el cliente sepa si debe
// pintar "Ver detalle" o "Protegido" sin tener que adivinarlo a partir del
// contenido ya redactado.
export function sanitizarAlerta(alerta, user) {
  if (!alerta.esVBG) return { ...alerta, detalleVisible: true };
  const detalleVisible = puedeVerDetalleVBG(user.rol, user.cargo);
  if (detalleVisible) return { ...alerta, detalleVisible: true };
  return {
    ...alerta,
    descripcion: "Detalle confidencial (VBG) — visible solo para el equipo autorizado.",
    creador: "Confidencial",
    detalleVisible: false
  };
}

export function sanitizarIntervencion(intervencion, user) {
  if (!intervencion.esSensibleVBG) return { ...intervencion, detalleVisible: true };
  const detalleVisible = puedeVerDetalleVBG(user.rol, user.cargo);
  if (detalleVisible) return { ...intervencion, detalleVisible: true };
  return {
    ...intervencion,
    motivo: "Detalle confidencial (VBG) — visible solo para el equipo autorizado.",
    resumenAcuerdo: "Detalle confidencial (VBG).",
    adjuntos: [],
    notasAclaratorias: [],
    detalleVisible: false
  };
}
