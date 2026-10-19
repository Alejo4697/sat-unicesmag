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
    return (
      <>
        <section className="card" aria-labelledby={`vec-section-${section}`}>
          <div className="card-header">
            <h2 className="card-title" id={`vec-section-${section}`}>
              <i className={`fas ${content.icon}`} aria-hidden="true"></i>
              {content.title}
            </h2>
          </div>
          <p className="text-muted">{content.message}</p>
        </section>
        <ApoyosView />
      </>
    );
  }

  if (section === "registros") {
    return (
      <>
        <section className="card" aria-labelledby={`vec-section-${section}`}>
          <div className="card-header">
            <h2 className="card-title" id={`vec-section-${section}`}>
              <i className={`fas ${content.icon}`} aria-hidden="true"></i>
              {content.title}
            </h2>
          </div>
          <p className="text-muted">{content.message}</p>
          <ol className="vec-workflow-steps" aria-label="Pasos para verificar asistencia">
            <li><strong>1.</strong> Busca y selecciona la actividad registrada por su nombre, periodo y fechas.</li>
            <li><strong>2.</strong> Revisa la lista de participantes inscritos en esa actividad.</li>
            <li><strong>3.</strong> Confirma quiénes asistieron o descarga el reporte de la actividad.</li>
          </ol>
        </section>
        <AsistentesActividadTable />
      </>
    );
  }

  return null;
}
