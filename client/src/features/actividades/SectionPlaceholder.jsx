import AsistentesActividadTable from "./AsistentesActividadTable.jsx";
import ApoyosView from "./ApoyosView.jsx";

const SECTION_CONTENT = {
  registros: {
    title: "Asistencia y reportes",
    icon: "fa-clipboard-check",
    message: "Selecciona una actividad registrada para revisar sus participantes, confirmar la asistencia y descargar el reporte correspondiente.",
  },
  apoyos: {
    title: "Consultar apoyos",
    icon: "fa-hand-holding-heart",
    message: "Consulta los beneficiarios registrados en actividades por tipo de apoyo.",
  },
};

export default function SectionPlaceholder({ section }) {
  const content = SECTION_CONTENT[section];
  if (!content) return null;

  if (section === "apoyos") {
    return <ApoyosView />;
  }

  if (section === "registros") {
    return (
      <section className="vec-attendance-page" aria-labelledby={`vec-section-${section}`}>
        <header className="vec-attendance-hero">
          <span className="vec-attendance-hero__icon" aria-hidden="true">
            <i className={`fas ${content.icon}`}></i>
          </span>
          <div>
            <span className="vec-attendance-hero__eyebrow">ACTIVIDADES VEC</span>
            <h1 id={`vec-section-${section}`}>{content.title}</h1>
            <p>{content.message}</p>
          </div>
        </header>
        <ol className="vec-attendance-workflow" aria-label="Flujo de verificación de asistencia">
          <li><span>01</span><div><strong>Selecciona la actividad</strong><small>Filtra por nombre y confirma el periodo y las fechas.</small></div></li>
          <li><span>02</span><div><strong>Concilia la lista</strong><small>Marca manualmente o importa un archivo exportado de Forms.</small></div></li>
          <li><span>03</span><div><strong>Revisa y confirma</strong><small>Solo las coincidencias verificadas quedan registradas.</small></div></li>
        </ol>
        <AsistentesActividadTable />
      </section>
    );
  }

  return null;
}
