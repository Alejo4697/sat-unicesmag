import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  actualizarActividad,
  cambiarEstadoActividad,
  buscarPersonasActividades,
  corregirTipoApoyoInscripcion,
  crearActividad,
  eliminarActividad,
  getAuditoriaInscripcion,
  getActividades,
  getCatalogosEstudiante,
  getHistorialParticipacion,
  getParticipantesActividad,
} from "./participantesApi.js";

const EMPTY_FORM = {
  idPeriodo: "", actividad: "", programaBienestar: "", subdivisionProgramas: [],
  descripcion: "", ubicacion: "", fechaInicio: "", fechaFinalizacion: "",
  modalidad: "", alianzaInterinstitucional: "", entidadAlianza: "",
  articulacionInstitucional: "", idDependencia: "", dependenciaOtra: "",
  estrategiaPoliticaBienestar: "", estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "", tipoActividadOtra: "",
};
const ESTADOS = ["PROGRAMADA", "EN_CURSO", "FINALIZADA", "CANCELADA"];
const ETIQUETAS_ESTADO = {
  PROGRAMADA: "Programadas",
  EN_CURSO: "En curso",
  FINALIZADA: "Finalizadas",
  CANCELADA: "Canceladas",
};

function formatoFecha(value) {
  const fecha = String(value || "").slice(0, 10);
  if (!fecha) return "Fecha pendiente";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00`));
}

function claseEstado(estado) {
  return `activity-status activity-status--${String(estado || "").toLowerCase()}`;
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`activity-modal${wide ? " activity-modal--wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="activity-modal__header">
        <div className="activity-modal__heading">
          <span className="activity-modal__heading-icon"><i className="fas fa-calendar-plus" aria-hidden="true"></i></span>
          <span>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </span>
        </div>
        <button className="activity-modal__close" type="button" onClick={onClose} aria-label="Cerrar ventana">
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div className="activity-modal__body">{children}</div>
    </dialog>
  );
}

function toForm(activity, programasBienestar) {
  const programa = programasBienestar.find((item) => item.programaCompleto === activity.programaBienestar);
  return {
    ...EMPTY_FORM,
    idEventoExistente: activity.id,
    idPeriodo: activity.idPeriodo,
    actividad: activity.actividad || "",
    programaBienestar: programa?.programa || activity.programaBienestar || "",
    subdivisionProgramas: Array.isArray(activity.variablesModalidades) && activity.variablesModalidades.length
      ? activity.variablesModalidades
      : (programa?.subdivision ? [programa.programaCompleto] : []),
    descripcion: activity.descripcion || "",
    ubicacion: activity.ubicacion || "",
    fechaInicio: String(activity.fechaInicio || "").slice(0, 10),
    fechaFinalizacion: String(activity.fechaFinalizacion || "").slice(0, 10),
    modalidad: activity.modalidad || "",
    tipoActividadOtra: activity.tipoActividadOtra || "",
    alianzaInterinstitucional: activity.alianzaInterinstitucional == null ? "" : String(activity.alianzaInterinstitucional),
    entidadAlianza: activity.entidadAlianza || "",
    articulacionInstitucional: activity.articulacionInstitucional || "",
    idDependencia: activity.idDependencia || "",
    dependenciaOtra: activity.dependenciaOtra || "",
    estrategiaPoliticaBienestar: activity.estrategiaPoliticaBienestar || "",
    estrategiaPoliticaPermanencia: activity.estrategiaPoliticaPermanencia || "",
    estrategiaPoliticaEducacionInclusiva: activity.estrategiaPoliticaEducacionInclusiva || "",
  };
}

export default function ActividadesAdminView() {
  const [actividades, setActividades] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [programasBienestar, setProgramasBienestar] = useState([]);
  const [tiposApoyo, setTiposApoyo] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState(null);
  const [participantes, setParticipantes] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [personaTerm, setPersonaTerm] = useState("");
  const [personas, setPersonas] = useState([]);
  const [edicionApoyo, setEdicionApoyo] = useState(null);
  const [auditoriaApoyo, setAuditoriaApoyo] = useState(null);
  const [guardandoApoyo, setGuardandoApoyo] = useState(false);
  const [eliminandoActividadId, setEliminandoActividadId] = useState("");
  const [buscandoPersonas, setBuscandoPersonas] = useState(false);

  const cargarActividades = useCallback(async () => {
    const rows = await getActividades({ busqueda });
    setActividades(rows);
  }, [busqueda]);

  useEffect(() => {
    let mounted = true;
    getCatalogosEstudiante()
      .then((refs) => {
        if (!mounted) return;
        setPeriodos(refs.periodos || []);
        setProgramasBienestar(refs.programasBienestar || []);
        setTiposApoyo(refs.tiposApoyo || []);
      })
      .catch((requestError) => mounted && setError(
        requestError.message || "No se pudieron cargar los catálogos de administración."
      ));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setCargando(true);
    const timeout = setTimeout(() => {
      getActividades({ busqueda })
        .then((rows) => active && setActividades(rows))
        .catch((requestError) => active && setError(
          requestError.message || "No se pudieron cargar las actividades."
        ))
        .finally(() => active && setCargando(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [busqueda]);

  useEffect(() => {
    if (personaTerm.trim().length < 2) {
      setPersonas([]);
      return undefined;
    }
    const timeout = setTimeout(() => {
      setBuscandoPersonas(true);
      buscarPersonasActividades(personaTerm.trim())
        .then(setPersonas)
        .catch((requestError) => setError(
          requestError.message || "No se pudo buscar la persona."
        ))
        .finally(() => setBuscandoPersonas(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [personaTerm]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  const programasDelGrupo = programasBienestar
    .filter((item) => item.programa === form?.programaBienestar);
  const opcionesProgramasBienestar = [...new Map(programasBienestar
    .filter((item) => item.programa)
    .map((item) => [item.programa, {
      value: item.programa,
      label: item.programa,
    }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const subdivisionesPrograma = programasDelGrupo
    .filter((item) => item.subdivision)
    .sort((a, b) => a.subdivision.localeCompare(b.subdivision, "es"));
  const modalidadesSeleccionadas = subdivisionesPrograma
    .filter((item) => form?.subdivisionProgramas?.includes(item.programaCompleto));
  const actividadesPorEstado = ESTADOS.map((estado) => ({
    estado,
    etiqueta: ETIQUETAS_ESTADO[estado],
    actividades: actividades.filter((activity) => activity.estado === estado),
  }));

  async function save(event) {
    event.preventDefault();
    setError("");
    setMensaje("");
    if (!form?.idPeriodo || !form.actividad?.trim() || !form.fechaInicio || !form.fechaFinalizacion || !form.ubicacion) {
      setError("Ingresa el periodo, el nombre de la actividad, la ubicación y ambas fechas.");
      return;
    }
    if (form.fechaFinalizacion < form.fechaInicio) {
      setError("La fecha final no puede ser anterior a la fecha inicial.");
      return;
    }
    if (subdivisionesPrograma.length > 0) {
      if (!form.subdivisionProgramas?.length) {
        setError("Selecciona el apoyo que se asignará. Puedes marcar solo uno aunque el programa tenga varias opciones.");
        return;
      }
      if (form.subdivisionProgramas.some((value) => (
        !subdivisionesPrograma.some((item) => item.programaCompleto === value)
      ))) {
        setError("Selecciona variables o modalidades válidas para el programa de Bienestar.");
        return;
      }
    }
    setGuardando(true);
    let saved = false;
    try {
      if (form.idEventoExistente) await actualizarActividad(form.idEventoExistente, form);
      else await crearActividad(form);
      saved = true;
      setMensaje(form.idEventoExistente ? "Actividad actualizada." : "Actividad guardada.");
      setForm(null);
      await cargarActividades();
    } catch (requestError) {
      setError(saved
        ? `La actividad se guardó, pero no se pudo actualizar la lista. ${requestError.message || ""}`.trim()
        : requestError.message || "No se pudo guardar la actividad.");
    } finally {
      setGuardando(false);
    }
  }

  async function changeStatus(id, estado) {
    setError("");
    try {
      await cambiarEstadoActividad(id, estado);
      await cargarActividades();
      setMensaje("Estado de actividad actualizado.");
      return true;
    } catch (requestError) {
      setError(requestError.message || "No se pudo actualizar el estado de la actividad.");
      return false;
    }
  }

  async function archiveActivity(activity) {
    const confirmed = window.confirm(
      `¿Archivar "${activity.actividad}"? Se marcará como cancelada y se conservarán sus participantes e historial.`
    );
    if (!confirmed) return;
    setError("");
    try {
      await cambiarEstadoActividad(activity.id, "CANCELADA");
      await cargarActividades();
      setMensaje("Actividad archivada. Se conservaron sus participantes e historial.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo archivar la actividad.");
    }
  }

  async function deleteActivity(activity) {
    const participantCount = Number(activity.totalParticipantes || 0);
    const impact = participantCount
      ? ` También se eliminarán sus ${participantCount} inscripciones, las modalidades y la auditoría asociadas. Los perfiles de estudiantes no se eliminan.`
      : " También se eliminarán las modalidades y la auditoría asociadas.";
    const confirmed = window.confirm(
      `¿Eliminar permanentemente "${activity.actividad}"? Esta acción no se puede deshacer.${impact}`
    );
    if (!confirmed) return;

    setError("");
    setMensaje("");
    setEliminandoActividadId(activity.id);
    try {
      const result = await eliminarActividad(activity.id);
      setActividades((current) => current.filter((item) => item.id !== activity.id));
      setParticipantes((current) => current?.actividadId === activity.id ? null : current);
      setForm((current) => current?.idEventoExistente === activity.id ? null : current);
      setMensaje(result.mensaje || `Se eliminó "${activity.actividad}" y sus datos asociados.`);
    } catch (requestError) {
      setError(requestError.message || "No se pudo eliminar la actividad.");
    } finally {
      setEliminandoActividadId("");
    }
  }

  async function showParticipants(activity) {
    setError("");
    setParticipantes({ actividadId: activity.id, actividad: activity.actividad, filas: [], cargando: true, error: "" });
    try {
      const filas = await getParticipantesActividad(activity.id);
      setParticipantes({ actividadId: activity.id, actividad: activity.actividad, filas, cargando: false, error: "" });
    } catch (requestError) {
      setParticipantes((current) => current ? {
        ...current,
        cargando: false,
        error: requestError.message || "No se pudieron cargar los participantes de la actividad.",
      } : current);
    }
  }

  async function showHistory(person) {
    setError("");
    try {
      const rows = await getHistorialParticipacion(person.identificacion);
      setHistorial({ person, rows });
    } catch (requestError) {
      setError(requestError.message || "No se pudo consultar el historial de participación.");
    }
  }

  async function saveSupportCorrection(event) {
    event.preventDefault();
    if (!edicionApoyo) return;
    setGuardandoApoyo(true);
    setError("");
    try {
      await corregirTipoApoyoInscripcion(edicionApoyo.id, {
        idTipoApoyo: edicionApoyo.idTipoApoyo,
        motivo: edicionApoyo.motivo,
      });
      const filas = await getParticipantesActividad(participantes.actividadId);
      setParticipantes((current) => current ? { ...current, filas } : current);
      setMensaje("Corrección de apoyo guardada con motivo y auditoría.");
      setEdicionApoyo(null);
    } catch (requestError) {
      setError(requestError.message || "No se pudo guardar la corrección del tipo de apoyo.");
    } finally {
      setGuardandoApoyo(false);
    }
  }

  async function showSupportAudit(row) {
    setError("");
    try {
      const rows = await getAuditoriaInscripcion(row.id);
      setAuditoriaApoyo({ persona: row.apellidosNombres, rows });
    } catch (requestError) {
      setError(requestError.message || "No se pudo consultar la auditoría del apoyo.");
    }
  }

  return (
    <>
      <section className="card activity-admin">
        <div className="activity-admin__header">
          <div>
            <span className="activity-admin__eyebrow">GESTIÓN VEC</span>
            <h2 className="card-title"><i className="fas fa-calendar-check" aria-hidden="true"></i> Actividades</h2>
            <p className="activity-admin__subtitle">Organiza, consulta y administra las actividades registradas.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setForm({ ...EMPTY_FORM })}>
            <i className="fas fa-plus" aria-hidden="true"></i> Crear actividad
          </button>
        </div>
        <div className="activity-toolbar">
          <div className="activity-toolbar__search">
            <label className="form-label" htmlFor="activity-search">Buscar actividades</label>
            <div className="activity-search">
              <i className="fas fa-search" aria-hidden="true"></i>
              <input
                className="form-control"
                id="activity-search"
                placeholder="Nombre, programa, proyecto o periodo"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
              />
            </div>
          </div>
        </div>
        {!cargando && (
          <div className="activity-overview" aria-label="Resumen de actividades por estado">
            {actividadesPorEstado.map((grupo) => (
              <div className="activity-overview__item" key={grupo.estado}>
                <span className={`activity-overview__icon activity-overview__icon--${grupo.estado.toLowerCase()}`}>
                  <i className="fas fa-calendar-alt" aria-hidden="true"></i>
                </span>
                <span><strong>{grupo.actividades.length}</strong><small>{grupo.etiqueta}</small></span>
              </div>
            ))}
          </div>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {mensaje && <div className="autosave-banner" role="status">{mensaje}</div>}
        {cargando ? <p className="text-muted" role="status">Consultando actividades de PostgreSQL...</p> : actividades.length === 0 ? (
          <div className="activity-empty" role="status">
            <span className="activity-empty__icon"><i className="fas fa-calendar-day" aria-hidden="true"></i></span>
            <strong>No hay actividades para mostrar</strong>
            <span>{busqueda ? "No se encontraron actividades con esa búsqueda." : "Cuando registres actividades, aparecerán organizadas aquí por estado."}</span>
          </div>
        ) : (
          <div className="activity-status-groups">
            {actividadesPorEstado.map((grupo) => (
            <details
              className={`activity-status-group activity-status-group--${grupo.estado.toLowerCase()}`}
              key={grupo.estado}
              open={grupo.actividades.length > 0}
            >
              <summary className="activity-status-group__header">
                <span className="activity-status-group__heading">
                  <span className={claseEstado(grupo.estado)}>{grupo.etiqueta}</span>
                  <span className="activity-status-group__count">{grupo.actividades.length}</span>
                </span>
                <i className="fas fa-chevron-down activity-status-group__chevron" aria-hidden="true"></i>
              </summary>
              {grupo.actividades.length ? (
              <div className="activity-card-grid">
            {grupo.actividades.map((activity) => {
              const bienestar = programasBienestar
                .find((item) => item.programaCompleto === activity.programaBienestar);
              const modalidades = Array.isArray(activity.variablesModalidades)
                ? activity.variablesModalidades
                : [];
              return (
                <article className="activity-card" key={activity.id}>
                  <div className="activity-card__top">
                    <span className="activity-card__icon"><i className="fas fa-calendar-check" aria-hidden="true"></i></span>
                    <span className={claseEstado(activity.estado)}>{String(activity.estado || "").replaceAll("_", " ")}</span>
                  </div>
                  <h3 className="activity-card__title">{activity.actividad}</h3>
                  <p className="activity-card__project">{activity.proyecto || "Actividad institucional"}</p>

                  <div className="activity-card__details">
                    <div className="activity-detail">
                      <i className="far fa-calendar-alt" aria-hidden="true"></i>
                      <span><strong>{activity.periodo || "Sin periodo"}</strong><small>{formatoFecha(activity.fechaInicio)} – {formatoFecha(activity.fechaFinalizacion)}</small></span>
                    </div>
                    <div className="activity-detail">
                      <i className="fas fa-map-marker-alt" aria-hidden="true"></i>
                      <span><strong>{activity.ubicacion || "Ubicación no especificada"}</strong><small>{activity.modalidad || "Modalidad no especificada"}</small></span>
                    </div>
                  </div>

                  {activity.programaBienestar && (
                    <div className="activity-card__program">
                      <span className="activity-card__label">PROGRAMA DE BIENESTAR</span>
                      <strong>{bienestar?.programa || activity.programaBienestar}</strong>
                      {modalidades.length > 0 && (
                        <div className="activity-card__tags">
                          {modalidades.map((modalidad) => {
                            const detalle = programasBienestar.find((item) => item.programaCompleto === modalidad);
                            const apoyoModalidad = activity.apoyosModalidades?.find(
                              (item) => item.programaCompleto === modalidad
                            );
                            return (
                              <span className="activity-chip" key={modalidad}>
                                {detalle?.subdivision || modalidad}
                                {apoyoModalidad?.tipoApoyo && <small>{apoyoModalidad.tipoApoyo}</small>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {activity.tipoApoyoPrograma && (
                        <span className="activity-card__support"><i className="fas fa-hand-holding-heart" aria-hidden="true"></i>{activity.tipoApoyoPrograma}</span>
                      )}
                    </div>
                  )}

                  <div className="activity-card__footer">
                    <button className="activity-card__participants" type="button" onClick={() => showParticipants(activity)}>
                      <i className="fas fa-users" aria-hidden="true"></i>
                      <span><strong>{activity.totalParticipantes}</strong> participantes</span>
                    </button>
                    <div className="activity-card__actions">
                      <label className="activity-card__status-control">
                        <span className="sr-only">Cambiar estado de {activity.actividad}</span>
                        <select
                          className="form-select"
                          value={activity.estado}
                          onChange={(event) => changeStatus(activity.id, event.target.value)}
                        >
                          {ESTADOS.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                        </select>
                      </label>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => setForm(toForm(activity, programasBienestar))}>Editar</button>
                      {activity.estado !== "CANCELADA" && (
                        <button className="btn btn-outline btn-sm activity-card__archive" type="button" onClick={() => archiveActivity(activity)}>Archivar</button>
                      )}
                      <button
                        className="btn btn-outline btn-sm activity-card__archive"
                        type="button"
                        onClick={() => deleteActivity(activity)}
                        disabled={Boolean(eliminandoActividadId)}
                      >
                        {eliminandoActividadId === activity.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                </article>
              );
                    })}
                  </div>
                ) : (
                  <p className="activity-status-group__empty">No hay actividades {grupo.etiqueta.toLowerCase()}.</p>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="card activity-people">
        <div className="activity-people__header">
          <div>
            <span className="activity-admin__eyebrow">CONSULTA</span>
            <h2 className="card-title">Historial de participación</h2>
            <p className="activity-admin__subtitle">Busca una persona para revisar su participación en actividades.</p>
          </div>
          {personas.length > 0 && <span className="activity-people__count">{personas.length} resultados</span>}
        </div>
        <div className="activity-people__search">
          <label className="form-label" htmlFor="activity-person-search">Documento, nombre o código</label>
          <div className="activity-search">
            <i className="fas fa-search" aria-hidden="true"></i>
            <input
              className="form-control"
              id="activity-person-search"
              placeholder="Escribe al menos 2 caracteres"
              value={personaTerm}
              onChange={(event) => setPersonaTerm(event.target.value)}
            />
          </div>
        </div>
        {buscandoPersonas && <p className="activity-people__message" role="status"><i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Buscando personas…</p>}
        {!buscandoPersonas && personaTerm.trim().length < 2 && (
          <p className="activity-people__message">Ingresa un nombre, documento o código para comenzar la búsqueda.</p>
        )}
        {!buscandoPersonas && personaTerm.trim().length >= 2 && personas.length === 0 && (
          <p className="activity-people__message" role="status">No se encontraron personas con esos datos.</p>
        )}
        {personas.length > 0 && <div className="table-responsive activity-people__table"><table className="table"><thead><tr><th>Persona</th><th>Documento</th><th>Código</th><th>Roles</th><th>Historial</th></tr></thead><tbody>{personas.map((person) => <tr key={person.idPersona}><td><strong>{[person.apellidos, person.nombres].filter(Boolean).join(" ")}</strong></td><td>{person.identificacion}</td><td>{person.codigo || "—"}</td><td>{person.roles.join(" · ") || "—"}</td><td><button className="btn btn-outline btn-sm" type="button" onClick={() => showHistory({ ...person, apellidosNombres: [person.apellidos, person.nombres].filter(Boolean).join(" ") })}>Ver historial</button></td></tr>)}</tbody></table></div>}
      </section>

      {form && (
        <Modal
          title={form.idEventoExistente ? "Editar actividad" : "Crear actividad"}
          subtitle="Completa la información para organizar y publicar la actividad."
          onClose={() => setForm(null)}
          wide
        >
        <section className="card activity-modal__card">
          <form onSubmit={save}>
            <div className="activity-form-content">
              <section className="activity-form-section">
                <div className="activity-form-section__heading">
                  <span className="activity-form-section__icon"><i className="fas fa-info-circle" aria-hidden="true"></i></span>
                  <span><h3>Información general</h3><p>Identifica la actividad y el programa al que pertenece.</p></span>
                </div>
                <div className="activity-form-grid">
                  <div className="form-group"><label className="form-label" htmlFor="activity-period">Periodo académico</label>
                    <select className="form-select" id="activity-period" value={form.idPeriodo} onChange={(event) => update("idPeriodo", event.target.value)} required>
                      <option value="">Selecciona el periodo</option>{periodos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label" htmlFor="activity-name">Nombre de la actividad</label>
                    <input className="form-control" id="activity-name" value={form.actividad} onChange={(event) => update("actividad", event.target.value)} maxLength={250} placeholder="Ej. Jornada de bienestar universitario" required />
                  </div>
                  <div className="form-group activity-form-field--wide"><label className="form-label" htmlFor="activity-program">Programa general de Bienestar <span className="activity-form-optional">Opcional</span></label>
                    <select className="form-select" id="activity-program" value={form.programaBienestar} onChange={(event) => setForm((current) => ({ ...current, programaBienestar: event.target.value, subdivisionProgramas: [] }))}>
                      <option value="">No aplica</option>{opcionesProgramasBienestar.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  {subdivisionesPrograma.length > 0 && (
                    <div className="form-group activity-form-field--wide activity-modalities-field" role="group" aria-labelledby="activity-subdivision-label">
                      <span className="form-label" id="activity-subdivision-label">Apoyos disponibles</span>
                      <p className="activity-modalities__hint">Marca únicamente los apoyos que manejará esta actividad. Puedes seleccionar uno solo aunque el programa tenga varias opciones.</p>
                      <div className="activity-modalities">
                        {subdivisionesPrograma.map((item) => {
                          const seleccionada = form.subdivisionProgramas.includes(item.programaCompleto);
                          return (
                            <label
                              className={`activity-modality${seleccionada ? " activity-modality--selected" : ""}`}
                              key={item.programaCompleto}
                            >
                              <input
                                className="activity-modality__checkbox"
                                type="checkbox"
                                checked={seleccionada}
                                onChange={(event) => update(
                                  "subdivisionProgramas",
                                  event.target.checked
                                    ? [...form.subdivisionProgramas, item.programaCompleto]
                                    : form.subdivisionProgramas.filter((value) => value !== item.programaCompleto)
                                )}
                              />
                              <span className="activity-modality__content">
                                <span className="activity-modality__name">{item.subdivision}</span>
                                <span className="activity-modality__support">
                                  <i className="fas fa-hand-holding-heart" aria-hidden="true"></i>
                                  {item.tipoApoyo || "Apoyo no especificado"}
                                </span>
                              </span>
                              <i className="fas fa-check activity-modality__check" aria-hidden="true"></i>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="activity-form-section">
                <div className="activity-form-section__heading">
                  <span className="activity-form-section__icon"><i className="far fa-calendar-alt" aria-hidden="true"></i></span>
                  <span><h3>Fecha y lugar</h3><p>Define cuándo se realizará y en qué modalidad y sede.</p></span>
                </div>
                <div className="activity-form-grid">
                  <div className="form-group"><label className="form-label" htmlFor="activity-start">Fecha inicial</label><input className="form-control" id="activity-start" type="date" value={form.fechaInicio} onChange={(event) => update("fechaInicio", event.target.value)} required /></div>
                  <div className="form-group"><label className="form-label" htmlFor="activity-end">Fecha final</label><input className="form-control" id="activity-end" type="date" value={form.fechaFinalizacion} onChange={(event) => update("fechaFinalizacion", event.target.value)} required /></div>
                  <div className="form-group"><label className="form-label" htmlFor="activity-mode">Modalidad</label><select className="form-select" id="activity-mode" value={form.modalidad} onChange={(event) => update("modalidad", event.target.value)}><option value="">Selecciona la modalidad</option>{["Presencial", "Virtual", "Híbrida"].map((item) => <option key={item}>{item}</option>)}</select></div>
                  <div className="form-group"><label className="form-label" htmlFor="activity-location">Campus</label><select className="form-select" id="activity-location" value={form.ubicacion} onChange={(event) => update("ubicacion", event.target.value)} required><option value="">Selecciona el campus</option>{["Campus Centro", "Campus San Damián", "Campus Santiago"].map((campus) => <option key={campus} value={campus}>{campus}</option>)}</select></div>
                </div>
              </section>

              <section className="activity-form-section">
                <div className="activity-form-section__heading">
                  <span className="activity-form-section__icon"><i className="fas fa-align-left" aria-hidden="true"></i></span>
                  <span><h3>Descripción</h3><p>Agrega información adicional para contextualizar la actividad.</p></span>
                  <span className="activity-form-optional">Opcional</span>
                </div>
                <textarea className="form-control activity-form-description" id="activity-description" aria-label="Descripción de la actividad" value={form.descripcion} onChange={(event) => update("descripcion", event.target.value)} rows={3} placeholder="Describe brevemente el propósito o los detalles de la actividad." />
              </section>
            </div>
            <div className="activity-form-footer">
              {error && <div className="auth-error" role="alert">{error}</div>}
              <div className="activity-form-footer__actions">
              <button className="btn btn-outline" type="button" onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary activity-form-submit" type="submit" disabled={guardando}>
                <i className={`fas ${guardando ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true"></i>
                {guardando ? "Guardando…" : form.idEventoExistente ? "Guardar cambios" : "Crear actividad"}
              </button>
              </div>
            </div>
          </form>
        </section>
        </Modal>
      )}

      {participantes && (
        <Modal title={`Participantes · ${participantes.actividad || "Actividad"}`} onClose={() => setParticipantes(null)} wide>
        <section className="card activity-modal__card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 className="card-title">Participantes · {participantes.actividad || "Actividad"}</h2>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setParticipantes(null)}>Cerrar</button>
          </div>
          {participantes.cargando ? <p className="text-muted" role="status">Cargando participantes...</p> : participantes.error ? <div className="auth-error" role="alert">{participantes.error}</div> : participantes.filas.length === 0 ? <p className="text-muted">Esta actividad todavía no tiene participantes.</p> : (
            <div className="table-responsive"><table className="table"><thead><tr><th>Persona</th><th>Documento</th><th>Rol</th><th>Correo</th><th>Tipo de apoyo</th><th>Acciones</th></tr></thead><tbody>
              {participantes.filas.map((row) => <tr key={row.id}><td>{row.apellidosNombres}</td><td>{row.identificacion}</td><td>{row.rolParticipacion}</td><td>{row.correo || "—"}</td><td>{row.tipoApoyo || "Sin clasificar"}</td><td style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}><button className="btn btn-outline btn-sm" type="button" onClick={() => showHistory(row)}>Historial</button><button className="btn btn-outline btn-sm" type="button" onClick={() => setEdicionApoyo({ id: row.id, persona: row.apellidosNombres, tipoActual: row.tipoApoyo || "Sin clasificar", idTipoApoyo: row.idTipoApoyo || "", motivo: "" })}>Corregir apoyo</button><button className="btn btn-outline btn-sm" type="button" onClick={() => showSupportAudit(row)}>Auditoría</button></td></tr>)}
            </tbody></table></div>
          )}
        </section>
        </Modal>
      )}
      {edicionApoyo && (
        <Modal title="Corregir tipo de apoyo" onClose={() => setEdicionApoyo(null)}>
        <section className="card activity-modal__card">
          <div className="card-header"><h2 className="card-title">Corregir tipo de apoyo</h2></div>
          <p><strong>{edicionApoyo.persona}</strong> · Tipo actual: {edicionApoyo.tipoActual}</p>
          <form onSubmit={saveSupportCorrection}>
            <div className="form-group">
              <label className="form-label" htmlFor="correction-support-type">Tipo de apoyo correcto</label>
              <select className="form-select" id="correction-support-type" value={edicionApoyo.idTipoApoyo} onChange={(event) => setEdicionApoyo((current) => ({ ...current, idTipoApoyo: event.target.value }))}>
                <option value="">Sin clasificar / no aplica</option>
                {tiposApoyo.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="correction-support-reason">Motivo de la corrección</label>
              <textarea className="form-control" id="correction-support-reason" value={edicionApoyo.motivo} onChange={(event) => setEdicionApoyo((current) => ({ ...current, motivo: event.target.value }))} minLength={5} maxLength={500} required rows={3} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: ".5rem" }}>
              <button className="btn btn-outline" type="button" onClick={() => setEdicionApoyo(null)} disabled={guardandoApoyo}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={guardandoApoyo}>{guardandoApoyo ? "Guardando…" : "Guardar corrección"}</button>
            </div>
          </form>
        </section>
        </Modal>
      )}
      {auditoriaApoyo && (
        <Modal title="Auditoría del apoyo" onClose={() => setAuditoriaApoyo(null)} wide>
        <section className="card activity-modal__card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 className="card-title">Auditoría del apoyo · {auditoriaApoyo.persona}</h2>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setAuditoriaApoyo(null)}>Cerrar</button>
          </div>
          {auditoriaApoyo.rows.length === 0 ? <p className="text-muted">No hay correcciones previas.</p> : (
            <div className="table-responsive"><table className="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo anterior</th><th>Tipo nuevo</th><th>Motivo</th></tr></thead><tbody>
              {auditoriaApoyo.rows.map((row) => <tr key={row.id}><td>{new Date(row.creadoEn).toLocaleString("es-CO")}</td><td>{row.usuarioId || "—"}</td><td>{row.tipoAnterior}</td><td>{row.tipoNuevo}</td><td>{row.detalle?.motivo}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
        </Modal>
      )}
      {historial && (
        <Modal title="Historial de participación" onClose={() => setHistorial(null)} wide>
        <section className="card activity-modal__card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 className="card-title">Historial de {historial.person.apellidosNombres}</h2>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setHistorial(null)}>Cerrar</button>
          </div>
          {historial.rows.length === 0 ? <p className="text-muted">Esta persona todavía no tiene actividades.</p> : (
            <div className="table-responsive"><table className="table"><thead><tr><th>Actividad</th><th>Periodo</th><th>Fecha</th><th>Estado</th><th>Rol</th><th>Apoyo</th><th>Asistencia</th></tr></thead><tbody>
              {historial.rows.map((row, index) => <tr key={`${row.idActividad}-${index}`}><td>{row.actividad}</td><td>{row.periodo}</td><td>{String(row.fechaInicio).slice(0, 10)} – {String(row.fechaFinalizacion).slice(0, 10)}</td><td>{row.estado}</td><td>{row.rol}</td><td>{row.tipoApoyo || "—"}</td><td>{row.asistenciaVerificada ? "Verificada" : "Pendiente"}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
        </Modal>
      )}
    </>
  );
}
