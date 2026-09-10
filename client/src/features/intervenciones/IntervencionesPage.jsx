/* ==========================================================================
   Feature: Intervenciones
   Ruta /intervenciones (independiente). Toda la lógica y el JSX viven en
   shared/panels/IntervencionesPanel.jsx, que también se embebe como pestaña
   dentro de la Ficha 360° del estudiante. Esta página solo lo envuelve en
   el <AppLayout> (sidebar + topbar) para el acceso directo por ruta.

   El panel conserva: formulario de proceso de escucha, auto-guardado de
   borrador (RQF04 / RNF04, localStorage), dropzone de evidencias PDF (máx.
   5MB, RQF16), casilla de caso sensible VBG y el historial protegido por
   RNF01.
   ========================================================================== */

import AppLayout from "../../shared/layout/AppLayout.jsx";
import IntervencionesPanel from "../../shared/panels/IntervencionesPanel.jsx";

export default function IntervencionesPage() {
  return (
    <AppLayout titulo="Registro de Intervenciones y Atención" breadcrumb="Procesos de Escucha / Auto-guardado RQF04">
      <IntervencionesPanel />
    </AppLayout>
  );
}
