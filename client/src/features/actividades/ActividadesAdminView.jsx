import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  actualizarActividad,
  cambiarEstadoActividad,
  buscarPersonasActividades,
  corregirTipoApoyoInscripcion,
  crearActividad,
  getAuditoriaInscripcion,
  getActividades,
  getCatalogoMaestroActividades,
  getCatalogosEstudiante,
  getHistorialParticipacion,
  getParticipantesActividad,
} from "./participantesApi.js";

const EMPTY_FORM = {
  idPeriodo: "", idCatalogoActividad: "", descripcion: "", ubicacion: "", fechaInicio: "", fechaFinalizacion: "",
  modalidad: "", alianzaInterinstitucional: "", entidadAlianza: "",
  articulacionInstitucional: "", idDependencia: "", dependenciaOtra: "",
  estrategiaPoliticaBienestar: "", estrategiaPoliticaPermanencia: "",
  estrategiaPoliticaEducacionInclusiva: "", tipoActividadOtra: "",
};
const ESTADOS = ["PROGRAMADA", "EN_CURSO", "FINALIZADA", "CANCELADA"];

function Modal({ title, onClose, children, wide = false }) {
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
        <h2 id={titleId}>{title}</h2>
        <button className="activity-modal__close" type="button" onClick={onClose} aria-label="Cerrar ventana">
          <i className="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <div className="activity-modal__body">{children}</div>
    </dialog>
  );
}

function toForm(activity) {
  return {
    ...EMPTY_FORM,
    idEventoExistente: activity.id,
    idPeriodo: activity.idPeriodo,
    idCatalogoActividad: activity.idCatalogoActividad,
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
  const [catalogo, setCatalogo] = useState([]);
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
  const [buscandoPersonas, setBuscandoPersonas] = useState(false);

  const cargarActividades = useCallback(async () => {
    const rows = await getActividades({ busqueda });
    setActividades(rows);
  }, [busqueda]);

  useEffect(() => {
    let mounted = true;
    Promise.all([getActividades(), getCatalogosEstudiante(), getCatalogoMaestroActividades()])
      .then(([rows, refs, activities]) => {
        if (!mounted) return;
        setActividades(rows);
        setPeriodos(refs.periodos || []);
        setTiposApoyo(refs.tiposApoyo || []);
        setCatalogo(activities || []);
      })
      .catch((requestError) => mounted && setError(requestError.message || "No se pudieron cargar las actividades."))
      .finally(() => mounted && setCargando(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      getActividades({ busqueda })
        .then(setActividades)
        .catch((requestError) => setError(requestError.message || "No se pudo filtrar el listado."));
    }, 250);
    return () => clearTimeout(timeout);
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
        .catch((requestError) => setError(requestError.message || "No se pudo buscar la persona."))
        .finally(() => setBuscandoPersonas(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [personaTerm]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    setMensaje("");
    if (!form?.idPeriodo || !form.idCatalogoActividad || !form.fechaInicio || !form.fechaFinalizacion) {
      setError("Selecciona el periodo, la actividad del catálogo y ambas fechas.");
      return;
    }
    if (form.fechaFinalizacion < form.fechaInicio) {
      setError("La fecha final no puede ser anterior a la fecha inicial.");
      return;
    }
    setGuardando(true);
    try {
      const result = form.idEventoExistente
        ? await actualizarActividad(form.idEventoExistente, form)
        : await crearActividad(form);
      setMensaje(form.idEventoExistente ? "Actividad actualizada." : "Actividad guardada.");
      setForm(null);
      await cargarActividades();
      if (result?.id && !form.idEventoExistente) setParticipantes({ actividadId: result.id, filas: [] });
    } catch (requestError) {
      setError(requestError.message || "No se pudo guardar la actividad.");
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
    } catch (requestError) {
      setError(requestError.message || "No se pudo cambiar el estado.");
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
        error: requestError.message || "No se pudieron consultar los participantes.",
      } : current);
    }
  }

  async function showHistory(person) {
    setError("");
    try {
      const rows = await getHistorialParticipacion(person.identificacion);
      setHistorial({ person, rows });
    } catch (requestError) {
      setError(requestError.message || "No se pudo consultar el historial.");
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
      setError(requestError.message || "No se pudo guardar la corrección del apoyo.");
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
      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <h2 className="card-title"><i className="fas fa-calendar-check" aria-hidden="true"></i> Actividades registradas</h2>
          <button className="btn btn-primary" type="button" onClick={() => setForm({ ...EMPTY_FORM })}>
            <i className="fas fa-plus" aria-hidden="true"></i> Crear actividad
          </button>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="activity-search">Buscar actividad, proyecto o periodo</label>
          <input className="form-control" id="activity-search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {mensaje && <div className="autosave-banner" role="status">{mensaje}</div>}
        {cargando ? <p className="text-muted" role="status">Consultando actividades de PostgreSQL...</p> : actividades.length === 0 ? (
          <p className="text-muted" role="status">No hay actividades guardadas que coincidan con la búsqueda.</p>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Actividad / proyecto</th><th>Periodo y fechas</th><th>Estado</th><th>Participantes</th><th>Acciones</th></tr></thead>
              <tbody>
                {actividades.map((activity) => (
                  <tr key={activity.id}>
                    <td><strong>{activity.actividad}</strong><div className="text-muted">{activity.proyecto}{activity.ubicacion ? ` · ${activity.ubicacion}` : ""}</div></td>
                    <td>{activity.periodo}<div className="text-muted">{String(activity.fechaInicio).slice(0, 10)} – {String(activity.fechaFinalizacion).slice(0, 10)}</div></td>
                    <td>
                      <select className="form-select" aria-label={`Estado de ${activity.actividad}`} value={activity.estado} onChange={(event) => changeStatus(activity.id, event.target.value)}>
                        {ESTADOS.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                      </select>
                    </td>
                    <td>{activity.totalParticipantes}</td>
                    <td style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => setForm(toForm(activity))}>Editar</button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => showParticipants(activity)}>Participantes</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header"><h2 className="card-title">Buscar una persona e historial</h2></div>
        <div className="form-group"><label className="form-label" htmlFor="activity-person-search">Documento, nombre o código</label><input className="form-control" id="activity-person-search" value={personaTerm} onChange={(event) => setPersonaTerm(event.target.value)} /></div>
        {buscandoPersonas && <p className="text-muted" role="status">Buscando personas…</p>}
        {personas.length > 0 && <div className="table-responsive"><table className="table"><thead><tr><th>Persona</th><th>Documento</th><th>Código</th><th>Roles</th><th>Historial</th></tr></thead><tbody>{personas.map((person) => <tr key={person.idPersona}><td>{[person.apellidos, person.nombres].filter(Boolean).join(" ")}</td><td>{person.identificacion}</td><td>{person.codigo || "—"}</td><td>{person.roles.join(" · ") || "—"}</td><td><button className="btn btn-outline btn-sm" type="button" onClick={() => showHistory({ ...person, apellidosNombres: [person.apellidos, person.nombres].filter(Boolean).join(" ") })}>Ver historial</button></td></tr>)}</tbody></table></div>}
      </section>

      {form && (
        <Modal title={form.idEventoExistente ? "Editar actividad" : "Crear actividad"} onClose={() => setForm(null)} wide>
        <section className="card activity-modal__card">
          <form onSubmit={save}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0 1rem" }}>
              <div className="form-group"><label className="form-label" htmlFor="activity-period">Periodo académico</label>
                <select className="form-select" id="activity-period" value={form.idPeriodo} onChange={(event) => update("idPeriodo", event.target.value)} required>
                  <option value="">Selecciona el periodo</option>{periodos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="activity-catalog">Actividad del catálogo institucional</label>
                <select className="form-select" id="activity-catalog" value={form.idCatalogoActividad} onChange={(event) => update("idCatalogoActividad", event.target.value)} required>
                  <option value="">Selecciona la actividad</option>{catalogo.map((item) => <option key={item.id} value={item.id} disabled={!item.proyecto}>{item.actividad} · {item.proyecto || "No disponible: falta proyecto"}</option>)}
                </select>
                {catalogo.some((item) => !item.proyecto) && <p className="text-muted">{catalogo.filter((item) => !item.proyecto).length} actividades del catálogo están deshabilitadas hasta completar su proyecto en la fuente institucional.</p>}
              </div>
              <div className="form-group"><label className="form-label" htmlFor="activity-start">Fecha inicial</label><input className="form-control" id="activity-start" type="date" value={form.fechaInicio} onChange={(event) => update("fechaInicio", event.target.value)} required /></div>
              <div className="form-group"><label className="form-label" htmlFor="activity-end">Fecha final</label><input className="form-control" id="activity-end" type="date" value={form.fechaFinalizacion} onChange={(event) => update("fechaFinalizacion", event.target.value)} required /></div>
              <div className="form-group"><label className="form-label" htmlFor="activity-mode">Modalidad</label><select className="form-select" id="activity-mode" value={form.modalidad} onChange={(event) => update("modalidad", event.target.value)}><option value="">Selecciona</option>{["Presencial", "Virtual", "Híbrida"].map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="form-group"><label className="form-label" htmlFor="activity-location">Ubicación</label><input className="form-control" id="activity-location" value={form.ubicacion} onChange={(event) => update("ubicacion", event.target.value)} /></div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}><label className="form-label" htmlFor="activity-description">Descripción</label><textarea className="form-control" id="activity-description" value={form.descripcion} onChange={(event) => update("descripcion", event.target.value)} rows={3} /></div>
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button className="btn btn-outline" type="button" onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
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
