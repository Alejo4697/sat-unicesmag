import { useEffect, useState } from "react";
import {
  eliminarPersonaParticipanteDefinitivamente,
  eliminarPerfilPorRol,
  getParticipantes,
} from "./participantesApi.js";

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
  puedeEliminar = false,
  refreshKey = 0,
  onChanged,
}) {
  const [expandido, setExpandido] = useState(!colapsadoInicialmente);
  const [participantes, setParticipantes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [consultado, setConsultado] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");

  async function confirmDeleteRole() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    setNotice("");
    try {
      const result = deleteTarget.tieneRolEstudiante
        ? await eliminarPerfilPorRol(deleteTarget.id, {
          confirmarInscripciones: Number(deleteTarget.totalInscripciones) > 0,
        })
        : await eliminarPersonaParticipanteDefinitivamente(
          deleteTarget.id,
          deleteConfirmation.trim(),
        );
      setParticipantes((current) => current.filter((item) => item.id !== deleteTarget.id));
      setNotice(result.mensaje || "Se quitó el rol seleccionado.");
      setDeleteTarget(null);
      setDeleteConfirmation("");
      onChanged?.();
    } catch (requestError) {
      setDeleteError(requestError.message || "No se pudo eliminar a la persona.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    setConsultado(false);
  }, [refreshKey]);

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
  }, [expandido, limite, recarga, consultado, refreshKey]);

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
          {notice && <div className="autosave-banner" role="status">{notice}</div>}
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
                    {puedeEliminar && <th>Acciones</th>}
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
                      {puedeEliminar && (
                        <td>
                          {participante.tipo !== "ESTUDIANTE" && ["EGRESADO", "COLABORADOR", "EXTERNO"].includes(participante.tipo) ? (
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => {
                                setDeleteError("");
                                setNotice("");
                                setDeleteConfirmation("");
                                setDeleteTarget(participante);
                              }}
                              aria-label={`${participante.tieneRolEstudiante ? "Quitar el rol" : "Borrar definitivamente"} ${ROLE_LABELS[participante.tipo] || participante.tipo} de ${[participante.nombres, participante.apellidos].filter(Boolean).join(" ")}`}
                            >
                              <i className={`fas ${participante.tieneRolEstudiante ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                              <span>{participante.tieneRolEstudiante ? "Quitar rol" : "Borrar definitivamente"}</span>
                            </button>
                          ) : (
                            <span className="vec-role-profiles__protected">
                              <i className="fas fa-lock" aria-hidden="true"></i> El rol Estudiante se conserva
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
      {deleteTarget && (
        <div className="vec-role-profiles__overlay" role="presentation">
          <section
            className="vec-role-profiles__delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vec-recent-participant-delete-title"
          >
            <span className="vec-profile-import__dialog-icon" aria-hidden="true">
              <i className="fas fa-triangle-exclamation"></i>
            </span>
            <h3 id="vec-recent-participant-delete-title">
              {deleteTarget.tieneRolEstudiante ? "¿Quitar solo el rol extra?" : "¿Borrar definitivamente a esta persona?"}
            </h3>
            <div className="vec-role-profiles__delete-warning" role="alert">
              <strong>{[deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" ") || "Persona sin nombre"}</strong>
              {deleteTarget.tieneRolEstudiante ? (
                <>
                  <span>Solo se quitará el rol <strong>{ROLE_LABELS[deleteTarget.tipo] || deleteTarget.tipo}</strong> y sus {Number(deleteTarget.totalInscripciones) || 0} inscripción(es) de Actividades.</span>
                  <span>El rol Estudiante, la persona y todos sus datos institucionales se conservarán.</span>
                </>
              ) : (
                <>
                  <span>Se borrarán todos sus perfiles, sus {Number(deleteTarget.totalInscripcionesPersona) || 0} inscripción(es), sus datos personales y sus registros vinculados.</span>
                  <span><strong>Este borrado es permanente y no se puede deshacer.</strong></span>
                </>
              )}
            </div>
            {!deleteTarget.tieneRolEstudiante && (
              <label className="vec-role-profiles__field">
                <span>
                  Escribe para confirmar: <strong>{deleteTarget.identificacion
                    || [deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" ")}</strong>
                </span>
                <input
                  className="form-control"
                  type="text"
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  disabled={deleting}
                  aria-label="Confirmar documento para borrar definitivamente"
                />
              </label>
            )}
            {deleteError && <div className="auth-error" role="alert">{deleteError}</div>}
            <footer>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError("");
                  setDeleteConfirmation("");
                }}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={confirmDeleteRole}
                disabled={deleting || (!deleteTarget.tieneRolEstudiante
                  && deleteConfirmation.trim() !== String(
                    deleteTarget.identificacion
                    || [deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" "),
                  ))}
              >
                <i className={`fas ${deleting ? "fa-spinner fa-spin" : deleteTarget.tieneRolEstudiante ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                {deleting
                  ? deleteTarget.tieneRolEstudiante ? "Quitando rol..." : "Borrando..."
                  : deleteTarget.tieneRolEstudiante ? "Sí, quitar solo el rol extra" : "Sí, borrar definitivamente"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
