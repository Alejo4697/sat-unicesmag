import AsistentesActividadTable from "./AsistentesActividadTable.jsx";
import ApoyosView from "./ApoyosView.jsx";

const SECTION_CONTENT = {
  registros: {
    title: "Asistencia y reportes",
    icon: "fa-clipboard-check",
    message: "Elige una actividad y su jornada para revisar asistentes, marcar la lista física desde Excel, pegando documentos o con el checklist, y descargar el reporte.",
  },
  apoyos: {
    title: "Consultar apoyos",
    icon: "fa-hand-holding-heart",
    message: "Selecciona un tipo de apoyo y el filtro de actividad mostrará únicamente las actividades donde se registró ese apoyo. También puedes limitar por periodo o buscar una persona por nombre/documento.",
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
            <li><strong>1.</strong> Busca y selecciona la actividad.</li>
            <li><strong>2.</strong> Elige el periodo y las fechas de la jornada.</li>
            <li><strong>3.</strong> Revisa la lista, carga el Excel o marca la asistencia manualmente.</li>
          </ol>
        </section>
        <AsistentesActividadTable />
      </>
    );
  }

  return null;
}
