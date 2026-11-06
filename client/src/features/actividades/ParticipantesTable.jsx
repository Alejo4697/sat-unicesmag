import { useEffect, useState } from "react";
import {
  eliminarPersonaParticipanteDefinitivamente,
  eliminarPerfilPorRol,
  getParticipantes,
} from "./participantesApi.js";
import { etiquetaRolInstitucional } from "./rolePresentation.js";

const ROLE_LABELS = {
  ESTUDIANTE: "Estudiante",
  DOCENTE: "Docente",
  COLABORADOR: "Docente",
  ADMINISTRATIVO: "Administrativo",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
};

function puedeEliminarParticipante(participante) {
  return participante.tipo !== "ESTUDIANTE"
    && ["EGRESADO", "COLABORADOR", "EXTERNO"].includes(participante.tipo);
}

function puedeQuitarRolParticipante(participante) {
  return ["EGRESADO", "COLABORADOR", "EXTERNO", "ADMINISTRATIVO"].includes(participante.tipo)
    && (participante.roles || []).length > 1;
}

function soloQuitarRol(participante) {
  return Boolean(
    participante.quitarSoloRol
    || participante.tieneRolEstudiante
    || puedeQuitarRolParticipante(participante),
  );
}

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
  const [busqueda, setBusqueda] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState(null);
  const [selectedForBulk, setSelectedForBulk] = useState(new Map());
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedParticipants = [...selectedForBulk.values()];
  const selectableParticipants = participantes.filter((participante) => (
    puedeEliminarParticipante(participante)
    || participante.tieneRolEstudiante
    || puedeQuitarRolParticipante(participante)
  ));
  const selectablePersonIds = new Set(
    selectableParticipants.map((participante) => String(participante.idPersona)),
  );
  const allSelectableSelected = selectablePersonIds.size > 0
    && [...selectablePersonIds].every((idPersona) => selectedForBulk.has(idPersona));

  function toggleSelectedParticipant(participante) {
    const personId = String(participante.idPersona);
    setSelectedForBulk((current) => {
      const next = new Map(current);
      if (next.has(personId)) next.delete(personId);
      else next.set(personId, participante);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedForBulk((current) => {
      const next = new Map(current);
      if (allSelectableSelected) {
        selectablePersonIds.forEach((idPersona) => next.delete(idPersona));
      } else {
        selectableParticipants.forEach((participante) => {
          const personId = String(participante.idPersona);
          if (!next.has(personId)) next.set(personId, participante);
        });
      }
      return next;
    });
  }

  async function deleteParticipant(participante, confirmation = "") {
    return soloQuitarRol(participante)
      ? eliminarPerfilPorRol(participante.id, {
        confirmarInscripciones: Number(participante.totalInscripciones) > 0,
      })
      : eliminarPersonaParticipanteDefinitivamente(
        participante.id,
        confirmation
          || participante.identificacion
          || [participante.nombres, participante.apellidos].filter(Boolean).join(" "),
      );
  }

  async function confirmDeleteRole() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    setNotice("");
    try {
      const result = await deleteParticipant(deleteTarget, deleteConfirmation.trim());
      setParticipantes((current) => current.filter((item) => (
        item.id !== deleteTarget.id
        && (deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante
          || item.idPersona !== deleteTarget.idPersona)
      )));
      setSelectedForBulk((current) => {
        const next = new Map(current);
        next.delete(String(deleteTarget.idPersona));
        return next;
      });
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

  async function confirmBulkDelete() {
    if (!bulkDeleteTargets?.length || bulkDeleting) return;
    setBulkDeleting(true);
    setDeleteError("");
    setNotice("");
    const removed = [];
    const failures = [];

    for (const participante of bulkDeleteTargets) {
      try {
        await deleteParticipant(participante);
        removed.push(participante);
      } catch (requestError) {
        failures.push({
          participante,
          message: requestError.message || "No se pudo eliminar a la persona.",
        });
      }
    }

    if (removed.length) {
      const removedIds = new Set(removed.map((participante) => participante.id));
      const permanentlyRemovedPeople = new Set(
        removed
          .filter((participante) => !soloQuitarRol(participante))
          .map((participante) => String(participante.idPersona)),
      );
      setParticipantes((current) => current.filter((participante) => (
        !removedIds.has(participante.id)
        && !permanentlyRemovedPeople.has(String(participante.idPersona))
      )));
      setSelectedForBulk((current) => {
        const next = new Map(current);
        removed.forEach((participante) => next.delete(String(participante.idPersona)));
        return next;
      });
    }

    setNotice(
      `${removed.length} persona(s) procesada(s) correctamente.`
      + (failures.length ? ` ${failures.length} no se pudieron eliminar; revisa el detalle.` : ""),
    );
    if (failures.length) {
      setBulkDeleteTargets(failures.map(({ participante }) => participante));
      setDeleteError(failures.map(({ participante, message }) => (
        `${[participante.nombres, participante.apellidos].filter(Boolean).join(" ") || participante.identificacion}: ${message}`
      )).join(" "));
    } else {
      setBulkDeleteTargets(null);
    }
    setBulkDeleting(false);
    if (removed.length) onChanged?.();
  }

  useEffect(() => {
    if (!expandido) return undefined;

    let activa = true;
    const timeout = setTimeout(() => {
      setCargando(true);
      setError("");
      getParticipantes({ limite, busqueda })
        .then((rows) => {
          if (activa) setParticipantes(rows);
        })
        .catch((requestError) => {
          if (activa) setError(requestError.message || "No se pudieron consultar los participantes.");
        })
        .finally(() => {
          if (activa) setCargando(false);
        });
    }, busqueda ? 250 : 0);
    return () => {
      activa = false;
      clearTimeout(timeout);
    };
  }, [expandido, limite, busqueda, recarga, refreshKey]);

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
                setSelectedForBulk(new Map());
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
            {expandido ? "Ocultar" : "Ver lista"}
          </button>
        </div>
      </div>

      {expandido && (
        <>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {notice && <div className="autosave-banner" role="status">{notice}</div>}
          {puedeEliminar && selectedParticipants.length > 0 && (
            <div className="vec-bulk-delete-toolbar" role="status">
              <span>
                <i className="fas fa-user-check" aria-hidden="true"></i>
                {selectedParticipants.length} persona(s) seleccionada(s)
              </span>
              <button
                className="btn btn-danger btn-sm"
                type="button"
                onClick={() => {
                  setDeleteError("");
                  setBulkDeleteTargets(selectedParticipants);
                }}
                disabled={bulkDeleting || deleting}
              >
                <i className="fas fa-trash-can" aria-hidden="true"></i>
                Revisar y eliminar
              </button>
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={() => setSelectedForBulk(new Map())}
                disabled={bulkDeleting || deleting}
              >
                Limpiar selección
              </button>
            </div>
          )}
          <label className="vec-participants-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value.slice(0, 100))}
              maxLength={100}
              placeholder="Buscar por nombre, documento, código o correo"
              aria-label="Buscar participantes para eliminar"
              disabled={deleting || bulkDeleting}
            />
          </label>
          {puedeEliminar && (
            <p className="vec-participants-search__hint">
              Busca una persona o selecciona varias; puedes acumular la selección entre búsquedas y revisar todo antes de borrar.
            </p>
          )}
          {cargando ? (
            <p className="text-muted" role="status">Cargando participantes...</p>
          ) : !error && participantes.length === 0 ? (
            <p className="text-muted">{busqueda.trim()
              ? "No se encontraron participantes con esa búsqueda."
              : "Todavía no hay participantes registrados."}</p>
          ) : !error ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    {puedeEliminar && (
                      <th>
                        <input
                          type="checkbox"
                          checked={allSelectableSelected}
                          onChange={toggleSelectAll}
                          disabled={cargando || selectablePersonIds.size === 0 || deleting || bulkDeleting}
                          aria-label="Seleccionar todas las personas que se pueden eliminar o retirar"
                        />
                      </th>
                    )}
                    <th>Tipo</th>
                    <th>Perfiles de Actividades y roles SAT</th>
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
                    const personId = String(participante.idPersona);
                    const seleccionable = puedeEliminarParticipante(participante)
                      || participante.tieneRolEstudiante
                      || puedeQuitarRolParticipante(participante);
                    const puedeQuitarRol = puedeQuitarRolParticipante(participante);
                    const selectedPerson = selectedForBulk.get(personId);
                    return (
                    <tr className={roles.length > 1 ? "vec-multiple-roles" : undefined} key={participante.id}>
                      {puedeEliminar && (
                        <td>
                          {seleccionable ? (
                            <input
                              type="checkbox"
                              checked={selectedForBulk.has(personId) && selectedPerson?.id === participante.id}
                              disabled={Boolean(selectedPerson && selectedPerson.id !== participante.id) || deleting || bulkDeleting}
                              onChange={() => toggleSelectedParticipant(participante)}
                              aria-label={`Seleccionar ${[participante.nombres, participante.apellidos].filter(Boolean).join(" ") || participante.identificacion} para eliminación`}
                            />
                          ) : (
                            <span className="vec-role-profiles__protected" aria-label={`${ROLE_LABELS[participante.tipo] || participante.tipo} protegido`}>
                              <i className="fas fa-lock" aria-hidden="true"></i>
                            </span>
                          )}
                        </td>
                      )}
                      <td>{ROLE_LABELS[participante.tipo] || participante.tipo}</td>
                      <td>
                        <div className="vec-institutional-roles">
                          <span className="vec-institutional-roles__label">
                            Perfiles de Actividades
                          </span>
                          <div className="vec-institutional-roles__badges">
                            {roles.map((role) => (
                              <span className={`vec-role-badge vec-role-${String(role).toLowerCase()}`} key={role}>
                                {ROLE_LABELS[role] || role}
                              </span>
                            ))}
                          </div>
                        </div>
                        {participante.rolesInstitucionales?.length > 0 && (
                          <div className="vec-institutional-roles">
                            <span className="vec-institutional-roles__label">
                              Roles institucionales en SAT
                            </span>
                            <div className="vec-institutional-roles__badges">
                              {participante.rolesInstitucionales.map((role) => (
                                <span
                                  className="vec-institutional-role"
                                  key={role}
                                  title={role}
                                >
                                  {etiquetaRolInstitucional(role)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td>{participante.identificacion || "No registrado"}</td>
                      <td>
                        <span
                          className={
                            roles.length > 1
                              ? "vec-multiple-roles__person"
                              : undefined
                          }
                        >
                          <span className={roles.length > 1 ? "vec-multiple-roles__name" : undefined}>
                            {[participante.nombres, participante.apellidos]
                              .filter(Boolean)
                              .join(" ") || "No registrado"}
                          </span>
                          {roles.length > 1 && (
                            <span
                              className="vec-multiple-roles__badge"
                              aria-label={`${roles.length} roles`}
                              title={roles.map((role) => ROLE_LABELS[role] || role).join(" · ")}
                            >
                              <i className="fas fa-layer-group" aria-hidden="true"></i>
                              {roles.length} roles
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{participante.codigo || "No registrado"}</td>
                      <td>{participante.programa_academico || participante.dependencia || "No registrado"}</td>
                      <td>{participante.correo || participante.contacto || "No registrado"}</td>
                      {puedeEliminar && (
                        <td>
                          {seleccionable ? (
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => {
                                setDeleteError("");
                                setNotice("");
                                setDeleteConfirmation("");
                                setDeleteTarget({
                                  ...participante,
                                  quitarSoloRol: soloQuitarRol(participante),
                                });
                              }}
                              aria-label={`${puedeQuitarRol || participante.tieneRolEstudiante ? "Quitar el rol" : "Borrar definitivamente"} ${ROLE_LABELS[participante.tipo] || participante.tipo} de ${[participante.nombres, participante.apellidos].filter(Boolean).join(" ")}`}
                              title={puedeQuitarRol || participante.tieneRolEstudiante
                                ? "Quitar solo este rol y conservar la persona y sus otros roles"
                                : "Borrar definitivamente a la persona, sus perfiles y datos vinculados"}
                            >
                              <i className={`fas ${puedeQuitarRol || participante.tieneRolEstudiante ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                              <span>{puedeQuitarRol || participante.tieneRolEstudiante
                                ? `Quitar ${ROLE_LABELS[participante.tipo] || participante.tipo}`
                                : "Borrar persona"}</span>
                            </button>
                          ) : (
                            <span className="vec-role-profiles__protected">
                              <i className="fas fa-lock" aria-hidden="true"></i> El rol institucional se conserva
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
              {deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante
                ? "¿Quitar solo el rol seleccionado?"
                : "¿Borrar definitivamente a esta persona?"}
            </h3>
            <div className="vec-role-profiles__delete-warning" role="alert">
              <strong>{[deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" ") || "Persona sin nombre"}</strong>
              {deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante ? (
                <>
                  <span>Solo se quitará el rol <strong>{ROLE_LABELS[deleteTarget.tipo] || deleteTarget.tipo}</strong> y sus {Number(deleteTarget.totalInscripciones) || 0} inscripción(es) de Actividades.</span>
                  <span>La persona, sus demás roles y sus datos institucionales se conservarán.</span>
                </>
              ) : (
                <>
                  <span>Se borrarán todos sus perfiles, sus {Number(deleteTarget.totalInscripcionesPersona) || 0} inscripción(es), sus datos personales, sus cuentas asociadas y sus registros vinculados.</span>
                  <span><strong>Este borrado es permanente y no se puede deshacer.</strong></span>
                </>
              )}
            </div>
            {!deleteTarget.quitarSoloRol && !deleteTarget.tieneRolEstudiante && (
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
                disabled={deleting || (!deleteTarget.quitarSoloRol && !deleteTarget.tieneRolEstudiante
                  && deleteConfirmation.trim() !== String(
                    deleteTarget.identificacion
                    || [deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" "),
                  ))}
              >
                <i className={`fas ${deleting ? "fa-spinner fa-spin" : deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                {deleting
                  ? deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante ? "Quitando rol..." : "Borrando..."
                  : deleteTarget.quitarSoloRol || deleteTarget.tieneRolEstudiante
                    ? "Sí, quitar solo este rol"
                    : "Sí, borrar definitivamente"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {bulkDeleteTargets && (
        <div className="vec-role-profiles__overlay" role="presentation">
          <section
            className="vec-role-profiles__delete-dialog vec-bulk-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vec-bulk-participant-delete-title"
          >
            <span className="vec-profile-import__dialog-icon" aria-hidden="true">
              <i className="fas fa-triangle-exclamation"></i>
            </span>
            <h3 id="vec-bulk-participant-delete-title">
              ¿Seguro que deseas eliminar estas {bulkDeleteTargets.length} persona(s)?
            </h3>
            <p>Revisa la selección antes de confirmar:</p>
            <ul className="vec-bulk-delete-list">
              {bulkDeleteTargets.map((participante) => (
                <li key={participante.id}>
                  <strong>{[participante.nombres, participante.apellidos].filter(Boolean).join(" ") || "Persona sin nombre"}</strong>
                  <span>{ROLE_LABELS[participante.tipo] || participante.tipo} · Documento: {participante.identificacion || "No registrado"}</span>
                  <span>
                    {soloQuitarRol(participante)
                      ? `Solo se quitará el rol seleccionado y sus ${Number(participante.totalInscripciones) || 0} inscripción(es); se conservará la persona y sus demás registros.`
                      : `Borrado permanente: se quitarán sus perfiles, ${Number(participante.totalInscripcionesPersona) || 0} inscripción(es), datos personales y registros vinculados, incluidas sus cuentas institucionales si las tiene.`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="vec-role-profiles__delete-warning" role="alert">
              <strong>Esta acción puede ser permanente.</strong>
              <span>Las personas con rol de estudiante solo perderán el rol de Actividades seleccionado. En las demás, se eliminarán también los demás perfiles y registros vinculados.</span>
            </div>
            {deleteError && <div className="auth-error" role="alert">{deleteError}</div>}
            <footer>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setBulkDeleteTargets(null);
                  setDeleteError("");
                }}
                disabled={bulkDeleting}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={confirmBulkDelete}
                disabled={bulkDeleting}
              >
                <i className={`fas ${bulkDeleting ? "fa-spinner fa-spin" : "fa-trash-can"}`} aria-hidden="true"></i>
                {bulkDeleting ? "Eliminando seleccionadas..." : `Sí, eliminar ${bulkDeleteTargets.length}`}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
