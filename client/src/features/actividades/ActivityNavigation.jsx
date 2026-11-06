import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";

const WORKFLOW_SECTIONS = [
  { id: "actividades", label: "Administrar actividades", description: "Define jornadas y revisa personas inscritas", icon: "fa-calendar-check" },
  { id: "nuevo", label: "Registrar participante", description: "Inscribe a una persona o importa una lista", icon: "fa-user-plus" },
  { id: "registros", label: "Asistencia y reportes", description: "Verifica asistencia y descarga reportes", icon: "fa-clipboard-check" },
];

const SUPPORT_SECTIONS = [
  { id: "apoyos", label: "Consultar apoyos", description: "Consulta beneficiarios por tipo de apoyo", icon: "fa-hand-holding-heart" },
  { id: "carga-realizadas", label: "Actividades realizadas", description: "Carga y registra actividades ejecutadas", icon: "fa-file-circle-plus" },
];

const DASHBOARD_SECTION = {
  id: "dashboard",
  label: "Resumen",
  description: "Indicadores y perfiles registrados",
  icon: "fa-chart-pie",
};

export default function ActivityNavigation({ activeSection }) {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const puedeAdministrar = ["admin", "administrador", "coordinador"].includes(String(user?.rol || "").toLowerCase());
  const groups = [
    {
      id: "overview",
      label: "Vista general",
      description: "Indicadores y estado del módulo",
      sections: [DASHBOARD_SECTION],
    },
    {
      id: "workflow",
      label: "Flujo de trabajo",
      description: "Desde la planeación hasta el seguimiento",
      sections: WORKFLOW_SECTIONS.filter((section) => (
        puedeAdministrar || section.id !== "actividades"
      )),
    },
    {
      id: "tools",
      label: "Consultas y otras herramientas",
      description: "Información complementaria del módulo",
      sections: SUPPORT_SECTIONS.filter((section) => (
        puedeAdministrar || section.id !== "carga-realizadas"
      )),
    },
  ];

  return (
    <nav className="activity-section-navigation" aria-label="Secciones de Registro de Actividades VEC">
      <div className="activity-section-navigation__heading">
        <span className="activity-section-navigation__eyebrow">MÓDULO DE ACTIVIDADES</span>
        <strong>De la planeación al seguimiento</strong>
      </div>
      {groups.map((group) => group.sections.length > 0 && (
        <div
          className={`activity-section-navigation__group activity-section-navigation__group--${group.id}`}
          key={group.id}
        >
          <div className="activity-section-navigation__group-heading">
            <strong>{group.label}</strong>
            <small>{group.description}</small>
          </div>
          <div
            className={`activity-section-navigation__grid activity-section-navigation__grid--${group.id}`}
          >
            {group.sections.map((section) => {
              const params = new URLSearchParams(searchParams);
              params.set("vista", section.id);
              return (
                <Link
                  key={section.id}
                  className={`activity-section-navigation__link${section.id === "actividades" ? " activity-section-navigation__link--featured" : ""}`}
                  to={{ pathname: "/actividades", search: `?${params.toString()}` }}
                  aria-current={activeSection === section.id ? "page" : undefined}
                >
                  <span className="activity-section-navigation__icon" aria-hidden="true">
                    <i className={`fas ${section.icon}`}></i>
                  </span>
                  <span className="activity-section-navigation__copy">
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                  <i className="fas fa-arrow-right activity-section-navigation__arrow" aria-hidden="true"></i>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
