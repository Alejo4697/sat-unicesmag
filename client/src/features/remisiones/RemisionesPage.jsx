/* ==========================================================================
   Feature: Remisiones
   Ruta /remisiones (independiente). Toda la lógica y el JSX viven en
   shared/panels/RemisionesPanel.jsx, que también se embebe como pestaña
   dentro de la Ficha 360° del estudiante. Esta página solo lo envuelve en
   el <AppLayout> para el acceso directo por ruta.

   El panel conserva: formulario de canalización (RQF17) y bandeja de casos
   remitidos con el modal "Gestionar Estado" para el flujo Generada ->
   Recibida/Asignada -> En Atención -> Atendida y las recomendaciones para
   el aula (RQF18).
   ========================================================================== */

import AppLayout from "../../shared/layout/AppLayout.jsx";
import RemisionesPanel from "../../shared/panels/RemisionesPanel.jsx";

export default function RemisionesPage() {
  return (
    <AppLayout titulo="Canalización y Remisiones" breadcrumb="Derivación Especializada y Trazabilidad RQF17 RQF18">
      <RemisionesPanel />
    </AppLayout>
  );
}
