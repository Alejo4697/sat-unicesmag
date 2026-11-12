import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";

const SECTIONS = [
  {
    id: "dashboard",
    label: "Resumen",
    description: "Indicadores y perfiles registrados",
    icon: "fa-chart-pie",
  },
  { id: "actividades", label: "Administrar actividades", description: "Define jornadas y revisa personas inscritas", icon: "fa-calendar-check" },
  { id: "registros", label: "Asistencia y reportes", description: "Verifica asistencia y descarga reportes", icon: "fa-clipboard-check" },
  { id: "apoyos", label: "Consultar apoyos", description: "Consulta beneficiarios por tipo de apoyo", icon: "fa-hand-holding-heart" },
  { id: "nuevo", label: "Registrar participante", description: "Inscribe a una persona o importa una lista", icon: "fa-user-plus" },
  { id: "carga-realizadas", label: "Actividades realizadas", description: "Carga y registra actividades ejecutadas", icon: "fa-file-circle-plus" },
];

export default function ActivityNavigation({ activeSection }) {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const puedeAdministrar = ["admin", "administrador", "coordinador"].includes(String(user?.rol || "").toLowerCase());
  const esReporteActividades = String(user?.rol || "").toLowerCase() === "reporte_actividades";
  const sections = SECTIONS
    .filter((section) => (
      puedeAdministrar
      || (esReporteActividades
        ? !["nuevo", "carga-realizadas"].includes(section.id)
        : !["actividades", "carga-realizadas"].includes(section.id))
    ))
    .map((section) => (
      esReporteActividades && section.id === "actividades"
        ? { ...section, label: "Consultar actividades", description: "Revisa jornadas, estados y personas inscritas" }
        : section
    ));

  return (
    <nav className="activity-section-navigation" aria-label="Secciones de Registro de Actividades VEC">
      <div className="activity-section-navigation__heading">
        <span className="activity-section-navigation__eyebrow">MÓDULO DE ACTIVIDADES</span>
        <strong>De la planeación al seguimiento</strong>
      </div>
      <div className="activity-section-navigation__grid">
        {sections.map((section) => {
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
    </nav>
  );
}
