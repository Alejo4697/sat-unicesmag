import { useEffect, useState } from "react";
import { getParticipantes } from "./participantesApi.js";

const ROLE_LABELS = {
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Colaborador",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
};

export default function ParticipantesTable({
  limite = 100,
  titulo = "Participantes registrados",
  colapsadoInicialmente = false,
}) {
  const [expandido, setExpandido] = useState(!colapsadoInicialmente);
  const [participantes, setParticipantes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [consultado, setConsultado] = useState(false);

  useEffect(() => {
    if (!expandido || consultado) return undefined;

    let activa = true;
    setCargando(true);
    setError("");
    getParticipantes({ limite })
      .then((rows) => {
        if (activa) setParticipantes(rows);
      })
      .catch((requestError) => {
        if (activa) setError(requestError.message || "No se pudieron consultar los participantes.");
      })
      .finally(() => {
        if (activa) {
          setCargando(false);
          setConsultado(true);
        }
      });
    return () => { activa = false; };
  }, [expandido, limite, recarga, consultado]);

  return (
    <section className="card" aria-label={titulo}>
      <div className="card-header">
        <div className="card-title">
          <i className="fas fa-users" aria-hidden="true"></i>
          {titulo}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {expandido && (
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={() => {
                setConsultado(false);
                setRecarga((value) => value + 1);
              }}
              disabled={cargando}
              aria-label="Actualizar lista de participantes"
            >
              <i className={`fas ${cargando ? "fa-spinner fa-spin" : "fa-rotate"}`} aria-hidden="true"></i>
              Actualizar
            </button>
          )}
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => setExpandido((value) => !value)}
            aria-expanded={expandido}
          >
            <i className={`fas ${expandido ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true"></i>
            {expandido ? "Ocultar" : `Ver ${limite} recientes`}
          </button>
        </div>
      </div>

      {expandido && (
        <>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {cargando ? (
            <p className="text-muted" role="status">Cargando participantes...</p>
          ) : !error && participantes.length === 0 ? (
            <p className="text-muted">Todavía no hay participantes registrados.</p>
          ) : !error ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Roles institucionales</th>
                    <th>Identificación</th>
                    <th>Nombre</th>
                    <th>Código</th>
                    <th>Programa / dependencia</th>
                    <th>Contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {participantes.map((participante) => {
                    const roles = participante.roles || [participante.tipo];
                    return (
                    <tr className={roles.length > 1 ? "vec-multiple-roles" : undefined} key={participante.id}>
                      <td>{ROLE_LABELS[participante.tipo] || participante.tipo}</td>
                      <td>
                        {roles.map((role) => (
                          <span className={`vec-role-badge vec-role-${String(role).toLowerCase()}`} key={role}>
                            {ROLE_LABELS[role] || role}
                          </span>
                        ))}
                      </td>
                      <td>{participante.identificacion || "No registrado"}</td>
                      <td>{[participante.nombres, participante.apellidos].filter(Boolean).join(" ") || "No registrado"}</td>
                      <td>{participante.codigo || "No registrado"}</td>
                      <td>{participante.programa_academico || participante.dependencia || "No registrado"}</td>
                      <td>{participante.correo || participante.contacto || "No registrado"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
