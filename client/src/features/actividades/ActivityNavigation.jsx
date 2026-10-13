import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";

const SECTIONS = [
  { id: "dashboard", label: "Resumen", icon: "fa-chart-pie" },
  { id: "actividades", label: "Administrar actividades", icon: "fa-calendar-check" },
  { id: "nuevo", label: "Registrar participante", icon: "fa-user-plus" },
  { id: "apoyos", label: "Consultar apoyos", icon: "fa-hand-holding-heart" },
  { id: "registros", label: "Asistencia y reportes", icon: "fa-clipboard-check" },
];

export default function ActivityNavigation({ activeSection }) {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const puedeAdministrar = ["admin", "administrador", "coordinador"].includes(String(user?.rol || "").toLowerCase());
  const visibleSections = SECTIONS.filter((section) => (
    puedeAdministrar || section.id !== "actividades"
  ));

  return (
    <nav aria-label="Secciones de Registro de Actividades VEC" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
        {visibleSections.map((section) => {
          const params = new URLSearchParams(searchParams);
          params.set("vista", section.id);
          return (
            <Link
              key={section.id}
              className={`btn ${activeSection === section.id ? "btn-primary" : "btn-outline"}`}
              to={{ pathname: "/actividades", search: `?${params.toString()}` }}
              aria-current={activeSection === section.id ? "page" : undefined}
            >
              <i className={`fas ${section.icon}`} aria-hidden="true"></i>
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
