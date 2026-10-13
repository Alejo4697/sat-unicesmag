import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import ActivityNavigation from "./ActivityNavigation.jsx";
import DashboardView from "./DashboardView.jsx";
import ActividadesAdminView from "./ActividadesAdminView.jsx";
import NewParticipantView from "./NewParticipantView.jsx";
import SectionPlaceholder from "./SectionPlaceholder.jsx";

const VALID_SECTIONS = new Set(["dashboard", "actividades", "nuevo", "apoyos", "registros"]);

export default function ActividadesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedSection = searchParams.get("vista");
  const activeSection = VALID_SECTIONS.has(requestedSection) ? requestedSection : "dashboard";
  const sectionTitle = activeSection === "dashboard"
    ? "Resumen"
    : activeSection === "actividades"
      ? "Administrar actividades"
      : activeSection === "nuevo"
      ? "Registrar participante"
      : activeSection === "apoyos"
        ? "Consultar apoyos"
        : "Asistencia y reportes";

  return (
    <AppLayout
      titulo="Registro de Actividades VEC"
      breadcrumb={`Actividades / ${sectionTitle}`}
    >
      <ActivityNavigation activeSection={activeSection} />
      {activeSection === "dashboard"
        ? <DashboardView />
        : activeSection === "actividades"
          ? <ActividadesAdminView />
        : activeSection === "nuevo"
          ? <NewParticipantView
            onCancel={() => navigate("/actividades?vista=dashboard", { replace: true })}
          />
            : <SectionPlaceholder section={activeSection} />}
    </AppLayout>
  );
}
