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

// Regla de autoría: motivo/resumenAcuerdo/adjuntos solo son visibles para
// quien registró la intervención (comparando id de usuario), salvo en casos
// VBG donde además se conserva la vía de acceso por rol/cargo (RNF01) para
// que Consultorios Jurídicos, USP y Administración puedan supervisar casos
// que no registraron ellos mismos.
export function sanitizarIntervencion(intervencion, user) {
  const esAutor = user?.id === intervencion.idUsuarioAtendio;

  if (!intervencion.esSensibleVBG) {
    // TODO: acceso total de admin a intervenciones no-VBG ajenas es temporal,
    // pendiente de confirmar en reunión de equipo (no está en la política RNF01).
    if (esAutor || user?.rol === "admin") return { ...intervencion, detalleVisible: true };
    return {
      ...intervencion,
      motivo: "Detalle visible solo para el profesional que registró la intervención.",
      resumenAcuerdo: "Detalle visible solo para el profesional que registró la intervención.",
      adjuntos: [],
      notasAclaratorias: [],
      detalleVisible: false
    };
  }

  const detalleVisible = esAutor || puedeVerDetalleVBG(user.rol, user.cargo);
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
