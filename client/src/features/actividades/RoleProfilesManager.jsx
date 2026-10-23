import { useEffect, useState } from "react";
import {
  agregarPerfilPorRol,
  actualizarPerfilPorRol,
  eliminarPersonaParticipanteDefinitivamente,
  eliminarPerfilPorRol,
  getPerfilesPorRol,
} from "./participantesApi.js";

const ROLES = [
  { value: "COLABORADOR", label: "Colaboradores", singular: "Colaborador", icon: "fa-user-tie" },
  { value: "EGRESADO", label: "Egresados", singular: "Egresado", icon: "fa-user-graduate" },
  { value: "EXTERNO", label: "Externos", singular: "Externo", icon: "fa-user-group" },
];
const ROLE_LABELS = {
  ESTUDIANTE: "Estudiante",
  EGRESADO: "Egresado",
  COLABORADOR: "Colaborador",
  EXTERNO: "Externo",
};

const EMPTY_FORM = {
  nombres: "",
  apellidos: "",
  tipoDocumento: "",
  codigo: "",
  fechaNacimiento: "",
  lugarNacimiento: "",
  genero: "",
  correo: "",
  celular: "",
  telefono: "",
  direccion: "",
  municipio: "",
  fechaEgreso: "",
  programaAcademico: "",
  programaPosgradoDependencia: "",
  semestre: "",
  jornada: "",
  dependencia: "",
  cargo: "",
  etnia: "",
  discapacidad: "",
  conflictoArmado: "",
};

const DOCUMENT_TYPES = [
  ["CC", "Cédula de ciudadanía"],
  ["TI", "Tarjeta de identidad"],
  ["CE", "Cédula de extranjería"],
  ["PA", "Pasaporte"],
  ["RC", "Registro civil"],
  ["NIT", "NIT"],
  ["PPT", "PPT"],
  ["PEP", "PEP"],
  ["CD", "Carné diplomático"],
  ["SC", "Salvoconducto"],
  ["NUIP", "NUIP"],
  ["OTRO", "Otro"],
];

const GENDERS = [
  "Femenino",
  "Masculino",
  "No binario",
  "Otro",
  "Prefiero no responder",
];

function dateValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function displayGender(value) {
  return ({
    F: "Femenino",
    M: "Masculino",
    NB: "No binario",
    O: "Otro",
    OT: "Otro",
    NR: "Prefiero no responder",
  })[String(value || "").trim().toUpperCase()] || value || "";
}

function getForm(person) {
  return {
    ...EMPTY_FORM,
    ...person,
    genero: displayGender(person.genero),
    fechaNacimiento: dateValue(person.fechaNacimiento),
    fechaEgreso: dateValue(person.fechaEgreso),
    semestre: person.semestre ?? "",
  };
}

function textField(form, setForm, name, label, options = {}) {
  return (
    <label className="vec-role-profiles__field" key={name}>
      <span>{label}{options.required && <b aria-hidden="true"> *</b>}</span>
      <input
        className="form-control"
        type={options.type || "text"}
        value={form[name] ?? ""}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
        maxLength={options.maxLength}
        min={options.min}
        max={options.max}
        required={options.required}
        disabled={options.disabled}
      />
    </label>
  );
}

export default function RoleProfilesManager({ refreshKey = 0, onChanged }) {
  const [role, setRole] = useState("COLABORADOR");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [addRoleTarget, setAddRoleTarget] = useState(null);
  const [addRoleValue, setAddRoleValue] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError("");
      getPerfilesPorRol({ rol: role, busqueda: search.trim() })
        .then((rows) => {
          if (active) setProfiles(rows);
        })
        .catch((requestError) => {
          if (active) setError(requestError.message || "No se pudieron consultar los perfiles.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [role, search, refreshKey, reload]);

  function changeRole(nextRole) {
    if (role === nextRole) return;
    setRole(nextRole);
    setNotice("");
    setError("");
  }

  function beginEdit(person) {
    setEditing(person);
    setForm(getForm(person));
    setError("");
    setNotice("");
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await actualizarPerfilPorRol(editing.id, {
        ...form,
        tipo: editing.rol,
        semestre: form.semestre === "" ? null : Number(form.semestre),
      });
      setNotice(result.mensaje || "Perfil actualizado.");
      setEditing(null);
      setReload((value) => value + 1);
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  function availableRolesFor(person) {
    const existingRoles = new Set((person.roles || []).map((item) => String(item).toUpperCase()));
    if (existingRoles.has("EXTERNO")) return [];
    return ROLES.filter((item) => (
      !existingRoles.has(item.value)
      && (item.value !== "EXTERNO" || existingRoles.size === 0)
    ));
  }

  function beginAddRole(person) {
    const availableRoles = availableRolesFor(person);
    if (!availableRoles.length) return;
    setAddRoleTarget(person);
    setAddRoleValue(availableRoles[0].value);
    setError("");
    setNotice("");
  }

  async function confirmAddRole() {
    if (!addRoleTarget || !addRoleValue) return;
    setAddingRole(true);
    setError("");
    setNotice("");
    try {
      const result = await agregarPerfilPorRol(addRoleTarget.id, {
        rol: addRoleValue,
        confirmarRolAdicional: true,
      });
      setNotice(result.mensaje || `Se agregó el rol ${addRoleValue}.`);
      setAddRoleTarget(null);
      setAddRoleValue("");
      setReload((value) => value + 1);
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || "No se pudo agregar el rol.");
    } finally {
      setAddingRole(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setError("");
    setNotice("");
    try {
      const result = deletingProtected
        ? await eliminarPerfilPorRol(deleteTarget.id, {
          confirmarInscripciones: Number(deleteTarget.totalInscripciones) > 0,
        })
        : await eliminarPersonaParticipanteDefinitivamente(
          deleteTarget.id,
          deleteConfirmation.trim(),
        );
      setNotice(result.mensaje || "Perfil eliminado.");
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setReload((value) => value + 1);
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || "No se pudo eliminar el perfil.");
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } finally {
      setDeletingId("");
    }
  }

  const selectedRole = ROLES.find((item) => item.value === role);
  const editingProtected = Boolean(editing?.datosPersonalesProtegidos);
  const deletingProtected = Boolean(deleteTarget?.tieneRolEstudiante);
  const deleteEnrollmentCount = Number(
    deletingProtected ? deleteTarget?.totalInscripciones : deleteTarget?.totalInscripcionesPersona,
  ) || 0;

  return (
    <section className="card vec-role-profiles" aria-labelledby="vec-role-profiles-title">
      <header className="vec-role-profiles__heading">
        <span className="vec-profile-import__icon" aria-hidden="true">
          <i className="fas fa-address-book"></i>
        </span>
        <div>
          <span className="vec-profile-import__eyebrow">CONSULTA Y MANTENIMIENTO</span>
          <h2 id="vec-role-profiles-title">Personas por rol</h2>
          <p>Encuentra una persona, revisa sus roles y administra su ficha sin confundir los cambios que puedes hacer.</p>
        </div>
      </header>

      <div className="vec-role-profiles__guide" role="note">
        <span className="vec-role-profiles__guide-icon" aria-hidden="true"><i className="fas fa-circle-info"></i></span>
        <div>
          <strong>¿Qué puedes hacer aquí?</strong>
          <p><b>Agregar rol</b> conserva los actuales; <b>Editar</b> actualiza la ficha; <b>Quitar rol</b> conserva a estudiantes, mientras que <b>Borrar definitivamente</b> elimina a quien no es estudiante.</p>
        </div>
      </div>

      <div className="vec-role-profiles__toolbar">
        <div className="vec-role-profiles__filter">
          <span className="vec-role-profiles__filter-label">1. Elige el tipo de perfil</span>
          <div className="vec-role-profiles__tabs" role="tablist" aria-label="Filtrar personas por rol">
            {ROLES.map((item) => (
              <button
                className={`vec-role-profiles__tab${role === item.value ? " is-active" : ""}`}
                type="button"
                role="tab"
                key={item.value}
                aria-selected={role === item.value}
                onClick={() => changeRole(item.value)}
              >
                <i className={`fas ${item.icon}`} aria-hidden="true"></i>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="vec-role-profiles__search-group">
          <label className="vec-role-profiles__filter-label" htmlFor="vec-role-profiles-search">2. Busca a la persona</label>
          <label className="vec-role-profiles__search">
            <i className="fas fa-search" aria-hidden="true"></i>
            <input
              id="vec-role-profiles-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, documento o correo"
              aria-label="Buscar personas por nombre, documento o correo"
              maxLength={120}
            />
          </label>
        </div>
      </div>

      {notice && <div className="autosave-banner" role="status">{notice}</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}

      {loading ? (
        <div className="vec-role-profiles__state" role="status">
          <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Cargando {selectedRole.label.toLowerCase()}...
        </div>
      ) : profiles.length === 0 ? (
        <div className="vec-role-profiles__empty">
          <i className={`fas ${selectedRole.icon}`} aria-hidden="true"></i>
          <strong>{search.trim() ? "No hay coincidencias" : `Todavía no hay ${selectedRole.label.toLowerCase()} registrados`}</strong>
          <span>{search.trim() ? "Prueba con otro nombre, documento o correo." : "Cuando cargues perfiles de este rol, aparecerán aquí."}</span>
        </div>
      ) : (
        <>
          <div className="vec-role-profiles__results-heading">
            <div>
              <span className="vec-role-profiles__filter-label">3. Revisa los resultados</span>
              <strong>{selectedRole.label} encontrados</strong>
            </div>
            <span className="vec-role-profiles__result-count">{profiles.length}{profiles.length === 500 ? "+" : ""} perfiles</span>
          </div>
          <div className="vec-role-profiles__table-wrap">
            <table className="vec-role-profiles__table">
              <thead>
                <tr><th>Persona</th><th>Perfil seleccionado</th><th>Otros roles</th><th>Actividades</th><th>¿Qué deseas hacer?</th></tr>
              </thead>
              <tbody>
                {profiles.map((person) => (
                  <tr key={person.id}>
                    <td data-label="Persona">
                      <strong>{[person.nombres, person.apellidos].filter(Boolean).join(" ") || "Sin nombre"}</strong>
                      <small><i className="fas fa-id-card" aria-hidden="true"></i> {person.identificacion || "Sin documento"}</small>
                      <small><i className="fas fa-envelope" aria-hidden="true"></i> {person.correo || "Sin correo"}</small>
                    </td>
                    <td data-label="Perfil seleccionado">
                      <span className={`vec-role-badge vec-role-${String(person.rol).toLowerCase()}`}>
                        {ROLE_LABELS[person.rol] || person.rol}
                      </span>
                      <span className="vec-role-profiles__role-data">{person.programaAcademico || person.programaPosgradoDependencia || person.dependencia || person.cargo || "Sin datos adicionales"}</span>
                      {person.cargo && person.dependencia && <small>{person.cargo} · {person.dependencia}</small>}
                    </td>
                    <td data-label="Otros roles">
                      {(person.roles || []).some((item) => item !== person.rol) ? (
                        <div className="vec-role-profiles__badges">
                          {person.roles.filter((item) => item !== person.rol).map((item) => (
                            <span className={`vec-role-badge vec-role-${item.toLowerCase()}`} key={item}>{ROLE_LABELS[item] || item}</span>
                          ))}
                        </div>
                      ) : <span className="vec-role-profiles__no-other-roles">Sin otros roles</span>}
                      {person.datosPersonalesProtegidos && (
                        <small className="vec-role-profiles__protected"><i className="fas fa-lock" aria-hidden="true"></i> Datos personales protegidos</small>
                      )}
                    </td>
                    <td data-label="Actividades">
                      <span className="vec-role-profiles__enrollments">{person.totalInscripciones}</span>
                      <small>{Number(person.totalInscripciones) === 1 ? "actividad" : "actividades"}</small>
                    </td>
                    <td data-label="¿Qué deseas hacer?">
                      <div className="vec-role-profiles__actions">
                        {availableRolesFor(person).length > 0 && (
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => beginAddRole(person)}
                            aria-label={`Agregar otro rol a ${person.nombres} ${person.apellidos}`}
                            title="Agregar un rol sin quitar los que ya tiene"
                          >
                            <i className="fas fa-user-plus" aria-hidden="true"></i>
                          </button>
                        )}
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => beginEdit(person)} aria-label={`Editar perfil de ${person.nombres} ${person.apellidos}`} title="Editar los datos de este perfil">
                          <i className="fas fa-pen" aria-hidden="true"></i>
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => {
                            setDeleteConfirmation("");
                            setDeleteTarget(person);
                          }}
                          title={person.tieneRolEstudiante ? "Quitar solo este rol; conservar estudiante" : "Borrar definitivamente esta persona"}
                          aria-label={`${person.tieneRolEstudiante ? "Quitar el rol" : "Borrar definitivamente"} ${selectedRole.singular} de ${person.nombres} ${person.apellidos}`}
                        >
                          <i className={`fas ${person.tieneRolEstudiante ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                        </button>
                      </div>
                      {Number(person.totalInscripciones) > 0 && (
                        <small className="vec-role-profiles__delete-hint">
                          <i className="fas fa-circle-info" aria-hidden="true"></i>
                          {person.tieneRolEstudiante
                            ? ` Al quitar el rol, también saldrá de ${person.totalInscripciones} actividad(es).`
                            : ` Al borrar, también se eliminará de ${person.totalInscripciones} actividad(es).`}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {profiles.length === 500 && <p className="vec-role-profiles__limit">Se muestran hasta 500 perfiles. Usa la búsqueda para encontrar otros.</p>}
        </>
      )}

      {editing && (
        <div className="vec-role-profiles__overlay" role="presentation">
          <form className="vec-role-profiles__dialog" onSubmit={saveEdit} role="dialog" aria-modal="true" aria-labelledby="vec-role-profiles-edit-title">
            <header>
              <div>
                <span className="vec-profile-import__eyebrow">EDITAR FICHA</span>
                <h3 id="vec-role-profiles-edit-title">{[editing.nombres, editing.apellidos].filter(Boolean).join(" ")}</h3>
                <p>{selectedRole.singular} · Documento {editing.identificacion}</p>
              </div>
              <button className="vec-profile-import__workspace-close" type="button" onClick={() => setEditing(null)} disabled={saving} aria-label="Cerrar edición">
                <i className="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </header>

            {editingProtected && (
              <div className="vec-role-profiles__lock-note" role="status">
                <i className="fas fa-lock" aria-hidden="true"></i>
                Esta persona también es estudiante o funcionario. Sus nombres y datos de contacto vienen de registros institucionales y no se cambiarán aquí. Puedes editar los datos propios de esta ficha VEC.
              </div>
            )}

            <div className="vec-role-profiles__form">
              {textField(form, setForm, "nombres", "Nombres", { required: !editingProtected, disabled: editingProtected })}
              {textField(form, setForm, "apellidos", "Apellidos", { required: !editingProtected, disabled: editingProtected })}
              <label className="vec-role-profiles__field">
                <span>Tipo de documento</span>
                <select className="form-select" value={form.tipoDocumento || ""} onChange={(event) => setForm((current) => ({ ...current, tipoDocumento: event.target.value }))}>
                  <option value="">Sin especificar</option>
                  {DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {textField(form, setForm, "codigo", "Código institucional", { maxLength: 100 })}
              {textField(form, setForm, "fechaNacimiento", "Fecha de nacimiento", { type: "date", disabled: editingProtected })}
              {textField(form, setForm, "lugarNacimiento", "Lugar de nacimiento", { maxLength: 250 })}
              <label className="vec-role-profiles__field">
                <span>Género</span>
                <select className="form-select" value={form.genero || ""} onChange={(event) => setForm((current) => ({ ...current, genero: event.target.value }))} disabled={editingProtected}>
                  <option value="">Sin especificar</option>
                  {GENDERS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              {textField(form, setForm, "correo", "Correo personal", { type: "email", maxLength: 254, disabled: editingProtected })}
              {textField(form, setForm, "celular", "Celular", { maxLength: 32, disabled: editingProtected })}
              {textField(form, setForm, "telefono", "Teléfono alternativo", { maxLength: 32, disabled: editingProtected })}
              {textField(form, setForm, "direccion", "Dirección", { maxLength: 250, disabled: editingProtected })}
              {textField(form, setForm, "municipio", "Municipio", { maxLength: 150 })}
              {textField(form, setForm, "fechaEgreso", "Fecha de egreso", { type: "date" })}
              {textField(form, setForm, "programaAcademico", "Programa académico", { maxLength: 250 })}
              {textField(form, setForm, "programaPosgradoDependencia", "Programa de posgrado", { maxLength: 250 })}
              {textField(form, setForm, "semestre", "Semestre", { type: "number", min: 1, max: 32767 })}
              {textField(form, setForm, "jornada", "Jornada", { maxLength: 100 })}
              {textField(form, setForm, "dependencia", "Dependencia", { maxLength: 250 })}
              {textField(form, setForm, "cargo", "Cargo", { maxLength: 250 })}
              {textField(form, setForm, "etnia", "Etnia", { maxLength: 150 })}
              {textField(form, setForm, "discapacidad", "Discapacidad")}
              {textField(form, setForm, "conflictoArmado", "Conflicto armado")}
            </div>

            <footer>
              <button className="btn btn-outline" type="button" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {addRoleTarget && (
        <div className="vec-role-profiles__overlay" role="presentation">
          <section className="vec-role-profiles__add-role-dialog" role="alertdialog" aria-modal="true" aria-labelledby="vec-role-profiles-add-role-title">
            <span className="vec-profile-import__dialog-icon is-protected" aria-hidden="true">
              <i className="fas fa-user-plus"></i>
            </span>
            <h3 id="vec-role-profiles-add-role-title">Confirmar asignación de otro rol</h3>
            <p>
              <strong>{[addRoleTarget.nombres, addRoleTarget.apellidos].filter(Boolean).join(" ")}</strong>
              {" "}ya tiene {(addRoleTarget.roles || []).map((item) => item === "ESTUDIANTE" ? "Estudiante" : ROLES.find((roleItem) => roleItem.value === item)?.singular || item).join(", ")}.
            </p>
            <p>¿Deseas agregarle otro rol? El rol actual y sus datos se conservarán.</p>
            <label className="vec-role-profiles__field">
              <span>Rol que deseas agregar</span>
              <select
                className="form-select"
                value={addRoleValue}
                onChange={(event) => setAddRoleValue(event.target.value)}
                disabled={addingRole}
              >
                {availableRolesFor(addRoleTarget).map((item) => (
                  <option value={item.value} key={item.value}>{item.singular}</option>
                ))}
              </select>
            </label>
            <div className="vec-role-profiles__add-role-note" role="status">
              <i className="fas fa-circle-info" aria-hidden="true"></i>
              <span>Esta acción agrega un perfil adicional; no elimina ni reemplaza los roles existentes. El rol Externo no se puede combinar con otros.</span>
            </div>
            <footer>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => { setAddRoleTarget(null); setAddRoleValue(""); }}
                disabled={addingRole}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="button" onClick={confirmAddRole} disabled={addingRole || !addRoleValue}>
                <i className={`fas ${addingRole ? "fa-spinner fa-spin" : "fa-user-plus"}`} aria-hidden="true"></i>
                {addingRole ? "Agregando rol..." : `Sí, agregar ${ROLES.find((item) => item.value === addRoleValue)?.singular || "rol"}`}
              </button>
            </footer>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="vec-role-profiles__overlay" role="presentation">
          <section className="vec-role-profiles__delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="vec-role-profiles-delete-title">
            <span className={`vec-profile-import__dialog-icon${deletingProtected ? " is-protected" : ""}`} aria-hidden="true">
              <i className={`fas ${deletingProtected ? "fa-user-shield" : "fa-triangle-exclamation"}`}></i>
            </span>
            <h3 id="vec-role-profiles-delete-title">
              {deletingProtected ? "¿Quitar solo el rol extra?" : "¿Borrar definitivamente a esta persona?"}
            </h3>
            {deletingProtected ? (
              <div className="vec-role-profiles__delete-warning is-protected" role="alert">
                <strong>{[deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" ")}</strong>
                <span>
                  Esta persona también es estudiante. Al confirmar, solo quitaremos su rol extra <strong>{deleteTarget.rol}</strong> de Actividades.
                </span>
                <span>
                  <strong>El rol Estudiante, la persona y sus datos se conservarán.</strong>
                  {deleteEnrollmentCount > 0 && ` También la quitaremos de ${deleteEnrollmentCount} actividad(es).`}
                </span>
              </div>
            ) : (
              <div className="vec-role-profiles__delete-warning" role="alert">
                <strong>{[deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" ")}</strong>
                <span>
                  Se borrarán todos sus perfiles, sus {deleteEnrollmentCount} inscripción(es), sus datos personales y sus registros vinculados.
                </span>
                <span>Este borrado es permanente y no se puede deshacer.</span>
              </div>
            )}
            {!deletingProtected && (
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
                  disabled={Boolean(deletingId)}
                  aria-label="Confirmar documento para borrar definitivamente"
                />
              </label>
            )}
            <footer>
              <button className="btn btn-outline" type="button" onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmation("");
              }} disabled={Boolean(deletingId)}>Cancelar</button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={confirmDelete}
                disabled={Boolean(deletingId) || (!deletingProtected
                  && deleteConfirmation.trim() !== String(
                    deleteTarget.identificacion
                    || [deleteTarget.nombres, deleteTarget.apellidos].filter(Boolean).join(" "),
                  ))}
              >
                <i className={`fas ${deletingId ? "fa-spinner fa-spin" : deletingProtected ? "fa-user-minus" : "fa-trash-can"}`} aria-hidden="true"></i>
                {deletingId
                  ? "Eliminando..."
                  : deletingProtected
                    ? deleteEnrollmentCount > 0
                      ? "Sí, quitar el rol extra y sus inscripciones"
                      : "Sí, quitar solo este rol"
                    : "Sí, borrar definitivamente"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
