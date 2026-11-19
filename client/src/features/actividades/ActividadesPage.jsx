import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import ActivityNavigation from "./ActivityNavigation.jsx";
import DashboardView from "./DashboardView.jsx";
import ActividadesAdminView from "./ActividadesAdminView.jsx";
import NewParticipantView from "./NewParticipantView.jsx";
import SectionPlaceholder from "./SectionPlaceholder.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { getAccesoActividades } from "./participantesApi.js";

const VALID_SECTIONS = new Set(["dashboard", "actividades", "nuevo", "apoyos", "registros", "carga-realizadas"]);

export default function ActividadesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState("");
  const requestedSection = searchParams.get("vista");
  const esReporteActividades = String(user?.rol || "").toLowerCase() === "reporte_actividades";
  useEffect(() => {
    let active = true;
    setAccess(null);
    setAccessError("");
    getAccesoActividades()
      .then((result) => active && setAccess(result))
      .catch((error) => {
        if (active) {
          setAccessError(
            error.message || "No se pudo verificar el acceso a las actividades.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.rol]);

  const activeSection = VALID_SECTIONS.has(requestedSection)
    && (access?.moduloCompleto || !(esReporteActividades && ["nuevo", "carga-realizadas"].includes(requestedSection)))
    ? requestedSection
    : "dashboard";
  const sectionTitle = activeSection === "dashboard"
    ? "Resumen"
    : activeSection === "actividades"
      ? access?.restringido
        ? access?.soloActividadesPropias
          ? "Administrar mis actividades"
          : "Administrar actividades por línea de acción"
        : esReporteActividades && !access?.moduloCompleto
          ? "Consultar actividades"
          : "Administrar actividades"
      : activeSection === "nuevo"
      ? "Registrar participante"
      : activeSection === "apoyos"
        ? "Consultar apoyos"
        : activeSection === "registros"
          ? "Asistencia y reportes"
          : "Carga y registro de actividades realizadas";

  return (
    <AppLayout
      titulo="Registro de Actividades VEC"
      breadcrumb={`Actividades / ${sectionTitle}`}
    >
      {accessError ? (
        <div className="auth-error" role="alert">{accessError}</div>
      ) : !access ? (
        <p className="text-muted" role="status">Verificando permisos de actividades...</p>
      ) : (
        <>
          <ActivityNavigation activeSection={activeSection} access={access} />
          {activeSection === "dashboard"
            ? <DashboardView access={access} />
            : activeSection === "actividades"
              ? <ActividadesAdminView
                readOnly={!access.puedeCrear}
                access={access}
              />
            : activeSection === "nuevo"
              ? <NewParticipantView
                onCancel={() => navigate("/actividades?vista=dashboard", { replace: true })}
              />
              : <SectionPlaceholder section={activeSection} access={access} />}
        </>
      )}
    </AppLayout>
  );
}
