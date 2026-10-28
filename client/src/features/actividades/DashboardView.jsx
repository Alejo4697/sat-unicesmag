import { useEffect, useState } from "react";
import { getResumenParticipantes } from "./participantesApi.js";
import ParticipantesTable from "./ParticipantesTable.jsx";
import ProfileBulkImport from "./ProfileBulkImport.jsx";
import RoleProfilesManager from "./RoleProfilesManager.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";

const CARDS = [
  { label: "Total de participantes", key: "total_participantes", icon: "fa-users", color: "icon-blue" },
  { label: "Jornadas programadas", key: "total_actividades", icon: "fa-calendar-check", color: "icon-green" },
  { label: "Estudiantes", key: "estudiantes", icon: "fa-user-graduate", color: "icon-blue" },
  { label: "Colaboradores", key: "colaboradores", icon: "fa-user-tie", color: "icon-orange" },
  { label: "Administrativos", key: "administrativos", icon: "fa-user-gear", color: "icon-violet" },
  { label: "Egresados", key: "egresados", icon: "fa-user-check", color: "icon-green" },
  { label: "Externos", key: "externos", icon: "fa-user-group", color: "icon-red" },
];

export default function DashboardView() {
  const { user } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizacion, setActualizacion] = useState(0);
  const puedeAdministrar = ["admin", "administrador", "coordinador"]
    .includes(String(user?.rol || "").toLowerCase());

  useEffect(() => {
    let activa = true;
    setCargando(true);
    setError("");
    getResumenParticipantes()
      .then((data) => {
        if (activa) setResumen(data);
      })
      .catch((requestError) => {
        if (activa) setError(requestError.message || "No se pudo consultar el resumen de participantes.");
      })
      .finally(() => {
        if (activa) setCargando(false);
      });
    return () => { activa = false; };
  }, [actualizacion]);

  return (
    <section aria-labelledby="vec-dashboard-title">
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="dashboard-grid">
        {CARDS.map((card) => (
          <article className="kpi-card" key={card.label}>
            <div className="kpi-body">
              <span className="kpi-label">{card.label}</span>
              <span className="kpi-value" aria-label={cargando ? "Cargando" : resumen?.[card.key] == null ? "Sin datos" : undefined}>
                {cargando ? "…" : resumen?.[card.key] ?? "—"}
              </span>
              <span className="text-muted" style={{ fontSize: "0.72rem", marginTop: "0.4rem" }}>
                {card.key === "total_actividades"
                  ? "Jornadas de actividades VEC"
                  : cargando ? "Consultando base de datos" : "Según participantes registrados"}
              </span>
            </div>
            <span className={`kpi-icon ${card.color}`} aria-hidden="true">
              <i className={`fas ${card.icon}`}></i>
            </span>
          </article>
        ))}
      </div>
      <section className="card" aria-labelledby="vec-dashboard-title">
        <div className="card-header">
          <h2 className="card-title" id="vec-dashboard-title">
            <i className="fas fa-chart-column" aria-hidden="true"></i>
            Resumen de actividades
          </h2>
        </div>
        <p className="text-muted">Resumen basado en los registros guardados en el módulo VEC.</p>
      </section>
      {puedeAdministrar && <ProfileBulkImport onSaved={() => setActualizacion((current) => current + 1)} />}
      {puedeAdministrar && (
        <RoleProfilesManager
          refreshKey={actualizacion}
          onChanged={() => setActualizacion((current) => current + 1)}
        />
      )}
      <ParticipantesTable
        limite={10}
        titulo="Participantes recientes"
        colapsadoInicialmente
        puedeEliminar={puedeAdministrar}
        refreshKey={actualizacion}
        onChanged={() => setActualizacion((current) => current + 1)}
      />
    </section>
  );
}
