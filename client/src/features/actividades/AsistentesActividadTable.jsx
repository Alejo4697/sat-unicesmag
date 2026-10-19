import { useEffect, useMemo, useState } from "react";
import {
  exportarAsistentes,
  getActividadesDisponibles,
  getAsistentes,
  verificarAsistencia,
} from "./participantesApi.js";
import { useAuth } from "../../shared/context/AuthContext.jsx";

function fechaCorta(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

const ROL_LABELS = {
  ESTUDIANTE: "Estudiante",
  COLABORADOR: "Colaborador",
  EGRESADO: "Egresado",
  EXTERNO: "Externo",
};
function nombreArchivoActividad(value) {
  const nombre = String(value || "actividad")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `asistentes-${nombre || "actividad"}.xlsx`;
}

function normalizarBusqueda(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export default function AsistentesActividadTable() {
  const { user } = useAuth();
  const esCoordinador = ["admin", "administrador", "coordinador"]
    .includes(String(user?.rol || "").toLowerCase());
  const [actividades, setActividades] = useState([]);
  const [actividadId, setActividadId] = useState("");
  const [busquedaActividad, setBusquedaActividad] = useState("");
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [opcionActiva, setOpcionActiva] = useState(0);
  const [busquedaAsistente, setBusquedaAsistente] = useState("");
  const [asistentes, setAsistentes] = useState([]);
  const [idsSeleccionados, setIdsSeleccionados] = useState(() => new Set());
  const [resultadoLote, setResultadoLote] = useState("");
  const [verificandoIds, setVerificandoIds] = useState([]);
  const [cargandoActividades, setCargandoActividades] = useState(true);
  const [cargandoAsistentes, setCargandoAsistentes] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const actividadSeleccionada = actividades.find((actividad) => actividad.id === actividadId);
  const asistenciasConfirmadas = asistentes.filter((item) => item.asistenciaVerificada).length;
  const porcentajeAsistencia = asistentes.length
    ? Math.round((asistenciasConfirmadas / asistentes.length) * 100)
    : 0;

  useEffect(() => {
    const controller = new AbortController();
    getActividadesDisponibles({ signal: controller.signal })
      .then(setActividades)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || "No se pudieron cargar las actividades registradas.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoActividades(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!actividadId || !actividadSeleccionada) {
      setAsistentes([]);
      setCargandoAsistentes(false);
      return undefined;
    }

    const controller = new AbortController();
    setCargandoAsistentes(true);
    setAsistentes([]);
    setError("");
    getAsistentes({
      idActividad: actividadId,
      idPeriodo: actividadSeleccionada.idPeriodo,
      fechaInicio: fechaCorta(actividadSeleccionada.fechaInicio),
      fechaFinalizacion: fechaCorta(actividadSeleccionada.fechaFinalizacion),
      signal: controller.signal,
    })
      .then((rows) => {
        if (!controller.signal.aborted) setAsistentes(rows);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || "No se pudieron consultar los asistentes.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoAsistentes(false);
      });
    return () => controller.abort();
  }, [
    actividadId,
    actividadSeleccionada?.idPeriodo,
    actividadSeleccionada?.fechaInicio,
    actividadSeleccionada?.fechaFinalizacion,
  ]);
  const actividadesFiltradas = useMemo(() => {
    const term = normalizarBusqueda(busquedaActividad);
    return actividades
      .map((actividad) => {
        const campos = [
          actividad.actividad,
          actividad.proyecto,
          actividad.programa,
          actividad.hojaOrigen,
        ].map(normalizarBusqueda);
        const coincide = campos.some((value) => value.includes(term));
        const empiezaCon = campos.some((value) => value.startsWith(term));
        return { actividad, coincide, empiezaCon };
      })
      .filter(({ coincide }) => !term || coincide)
      .sort((left, right) => Number(right.empiezaCon) - Number(left.empiezaCon))
      .map(({ actividad }) => actividad);
  }, [actividades, busquedaActividad]);
  const opcionesVisibles = actividadesFiltradas.slice(0, 8);
  const asistentesFiltrados = asistentes.filter((asistente) => {
    const term = busquedaAsistente.trim().toLocaleLowerCase("es");
    if (!term) return true;
    return [
      asistente.identificacion,
      asistente.codigo,
      asistente.apellidosNombres,
      asistente.correo,
    ].some((value) => String(value || "").toLocaleLowerCase("es").includes(term));
  });
  function seleccionarActividad(actividad) {
    setActividadId(actividad.id);
    setBusquedaActividad(actividad.actividad);
    setBusquedaAsistente("");
    setAsistentes([]);
    setIdsSeleccionados(new Set());
    setResultadoLote("");
    setMostrarOpciones(false);
    setOpcionActiva(0);
  }

  function manejarTecladoActividad(event) {
    if (event.key === "Escape") {
      setMostrarOpciones(false);
      return;
    }

    if (event.key === "ArrowDown") {
      if (opcionesVisibles.length === 0) return;
      event.preventDefault();
      setMostrarOpciones(true);
      setOpcionActiva((current) => (
        mostrarOpciones ? Math.min(current + 1, opcionesVisibles.length - 1) : 0
      ));
      return;
    }

    if (event.key === "ArrowUp") {
      if (opcionesVisibles.length === 0) return;
      event.preventDefault();
      setMostrarOpciones(true);
      setOpcionActiva((current) => (
        mostrarOpciones ? Math.max(current - 1, 0) : opcionesVisibles.length - 1
      ));
      return;
    }

    if (event.key === "Enter" && mostrarOpciones && opcionesVisibles[opcionActiva]) {
      event.preventDefault();
      seleccionarActividad(opcionesVisibles[opcionActiva]);
    }
  }

  async function descargarExcel() {
    setExportando(true);
    setError("");
    try {
      const blob = await exportarAsistentes({
        idActividad: actividadId,
        idPeriodo: actividadSeleccionada?.idPeriodo,
        fechaInicio: fechaCorta(actividadSeleccionada?.fechaInicio),
        fechaFinalizacion: fechaCorta(actividadSeleccionada?.fechaFinalizacion),
        busqueda: busquedaAsistente.trim() || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nombreArchivoActividad(actividadSeleccionada?.actividad);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError.message || "No se pudo generar el Excel de asistentes.");
    } finally {
      setExportando(false);
    }
  }

  const asistentesPendientesVisibles = asistentesFiltrados.filter((item) => !item.asistenciaVerificada);
  const seleccionadosPendientes = asistentes.filter((item) => idsSeleccionados.has(item.id) && !item.asistenciaVerificada);

  function cambiarSeleccion(asistente, seleccionado) {
    if (asistente.asistenciaVerificada) return;
    setIdsSeleccionados((actuales) => {
      const siguientes = new Set(actuales);
      if (seleccionado) siguientes.add(asistente.id);
      else siguientes.delete(asistente.id);
      return siguientes;
    });
    setResultadoLote("");
  }

  function seleccionarPendientesVisibles() {
    setIdsSeleccionados((actuales) => {
      const siguientes = new Set(actuales);
      asistentesPendientesVisibles.forEach((item) => siguientes.add(item.id));
      return siguientes;
    });
  }

  async function confirmarAsistentes() {
    const registros = seleccionadosPendientes.map(({ id }) => id);
    if (!actividadSeleccionada || registros.length === 0) return;
    setVerificandoIds(registros);
    setError("");
    setResultadoLote("");
    try {
      await verificarAsistencia({
        idActividad: actividadId,
        idPeriodo: actividadSeleccionada.idPeriodo,
        fechaInicio: fechaCorta(actividadSeleccionada.fechaInicio),
        fechaFinalizacion: fechaCorta(actividadSeleccionada.fechaFinalizacion),
        registros,
        asistenciaVerificada: true,
      });
      const actualizados = await getAsistentes({
        idActividad: actividadId,
        idPeriodo: actividadSeleccionada.idPeriodo,
        fechaInicio: fechaCorta(actividadSeleccionada.fechaInicio),
        fechaFinalizacion: fechaCorta(actividadSeleccionada.fechaFinalizacion),
      });
      setAsistentes(actualizados);
      setIdsSeleccionados(new Set());
      const confirmados = actualizados.filter((item) => registros.includes(item.id) && item.asistenciaVerificada).length;
      setResultadoLote(`${confirmados} ${confirmados === 1 ? "asistente confirmado y guardado" : "asistentes confirmados y guardados"}.`);
    } catch (requestError) {
      setError(requestError.message || "No se pudieron confirmar las asistencias seleccionadas.");
    } finally {
      setVerificandoIds([]);
    }
  }
  return (
    <section className="card" aria-label="Asistentes por actividad">
      <div className="card-header">
        <h2 className="card-title">
          <i className="fas fa-users" aria-hidden="true"></i>
          Asistencia por actividad registrada
        </h2>
      </div>
      <p className="text-muted">
        Selecciona una actividad registrada para consultar y confirmar sus participantes, o descargar
        el reporte de esa actividad.
      </p>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <div className="vec-activity-filters">
        <div className="form-group vec-activity-search">
          <label className="form-label" htmlFor="vec-buscar-actividad">Actividad</label>
          <div className="vec-activity-combobox">
            <i className="fas fa-search vec-activity-search-icon" aria-hidden="true"></i>
            <input
              className="form-control"
              id="vec-buscar-actividad"
              type="text"
              value={busquedaActividad}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={mostrarOpciones}
              aria-controls="vec-activity-options"
              aria-activedescendant={mostrarOpciones && opcionesVisibles[opcionActiva]
                ? `vec-activity-option-${opcionActiva}`
                : undefined}
              autoComplete="off"
              placeholder="Buscar actividad por nombre o proyecto"
              onFocus={() => setMostrarOpciones(true)}
              onBlur={() => setMostrarOpciones(false)}
              onKeyDown={manejarTecladoActividad}
              onChange={(event) => {
                setBusquedaActividad(event.target.value);
                setActividadId("");
                setBusquedaAsistente("");
                setAsistentes([]);
                setIdsSeleccionados(new Set());
                setResultadoLote("");
                setOpcionActiva(0);
                setMostrarOpciones(true);
              }}
              disabled={cargandoActividades}
            />
            {busquedaActividad && (
              <button
                className="vec-activity-clear"
                type="button"
                aria-label="Limpiar búsqueda de actividad"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setBusquedaActividad("");
                  setActividadId("");
                  setBusquedaAsistente("");
                  setAsistentes([]);
                  setIdsSeleccionados(new Set());
                  setResultadoLote("");
                  setMostrarOpciones(true);
                }}
              >
                <i className="fas fa-times" aria-hidden="true"></i>
              </button>
            )}
            {mostrarOpciones && (
              <div className="vec-activity-options" id="vec-activity-options" role="listbox">
                {cargandoActividades ? (
                  <div className="vec-activity-empty">Cargando actividades...</div>
                ) : opcionesVisibles.length === 0 ? (
                  <div className="vec-activity-empty">
                    {actividades.length === 0
                      ? "No hay actividades registradas disponibles para asistencia."
                      : "No se encontraron actividades con ese texto."}
                  </div>
                ) : (
                  <>
                    {opcionesVisibles.map((actividad, index) => (
                      <div
                        className={`vec-activity-option${index === opcionActiva ? " is-active" : ""}`}
                        id={`vec-activity-option-${index}`}
                        key={actividad.id}
                        role="option"
                        aria-selected={actividad.id === actividadId}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setOpcionActiva(index)}
                        onClick={() => seleccionarActividad(actividad)}
                      >
                        <span className="vec-activity-option-name">{actividad.actividad}</span>
                        <span className="vec-activity-option-meta">
                          {[actividad.periodo, fechaCorta(actividad.fechaInicio), fechaCorta(actividad.fechaFinalizacion)]
                            .filter(Boolean).join(" · ")}
                          {" · "}{actividad.totalAsistentes} participantes · {actividad.estado}
                        </span>
                      </div>
                    ))}
                    {actividadesFiltradas.length > opcionesVisibles.length && (
                      <div className="vec-activity-more">
                        Mostrando {opcionesVisibles.length} de {actividadesFiltradas.length}; escribe para afinar la búsqueda.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <span className="vec-activity-hint">
            {cargandoActividades
              ? "Cargando actividades registradas..."
              : `${actividades.length} actividades registradas disponibles`}
          </span>
        </div>
      </div>

      {actividadSeleccionada && (
        <>
          <div className="card-header" style={{ padding: "0.75rem 0", marginTop: "0.5rem" }}>
            <div>
              <h3 className="card-title">{actividadSeleccionada.actividad}</h3>
              <p className="text-muted" style={{ margin: "0.25rem 0 0" }}>
                {[
                  actividadSeleccionada.periodo,
                  `${fechaCorta(actividadSeleccionada.fechaInicio)} – ${fechaCorta(actividadSeleccionada.fechaFinalizacion)}`,
                  actividadSeleccionada.proyecto,
                  actividadSeleccionada.programa,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={descargarExcel}
              disabled={cargandoAsistentes || exportando}
            >
              <i className={`fas ${exportando ? "fa-spinner fa-spin" : "fa-file-excel"}`} aria-hidden="true"></i>
              {exportando ? "Generando reporte..." : "Descargar reporte Excel"}
            </button>
          </div>

              <div className="vec-attendance-summary" role="status">
                <div>
                  <strong>Jornada: {fechaCorta(actividadSeleccionada.fechaInicio)} – {fechaCorta(actividadSeleccionada.fechaFinalizacion)}</strong>
                  <span>{actividadSeleccionada.actividad}</span>
                </div>
                <div className="vec-attendance-progress">
                  <strong>{cargandoAsistentes
                    ? "Consultando asistentes..."
                    : `${asistenciasConfirmadas} de ${asistentes.length} asistencias confirmadas (${porcentajeAsistencia}%)`}</strong>
                  <progress value={asistenciasConfirmadas} max={Math.max(asistentes.length, 1)} aria-label="Progreso de verificación de asistencia" />
                  <span>{Math.max(asistentes.length - asistenciasConfirmadas, 0)} pendientes</span>
                </div>
              </div>
              {esCoordinador ? (
                <section className="vec-attendance-tools" aria-labelledby="vec-attendance-tools-title">
                  <h4 id="vec-attendance-tools-title">Confirmar asistentes</h4>
                  <p className="text-muted">Marca en la lista a quienes asistieron y confirma la selección para guardar la asistencia.</p>
                  <div className="vec-attendance-actions">
                    <span>{seleccionadosPendientes.length} seleccionados de {asistentesPendientesVisibles.length} pendientes visibles</span>
                    <div>
                      <button className="btn btn-outline btn-sm" type="button" onClick={seleccionarPendientesVisibles} disabled={asistentesPendientesVisibles.length === 0 || verificandoIds.length > 0}>Seleccionar pendientes visibles</button>
                      <button className="btn btn-outline btn-sm" type="button" onClick={() => setIdsSeleccionados(new Set())} disabled={idsSeleccionados.size === 0 || verificandoIds.length > 0}>Limpiar selección</button>
                      <button className="btn btn-primary btn-sm" type="button" onClick={confirmarAsistentes} disabled={seleccionadosPendientes.length === 0 || verificandoIds.length > 0 || cargandoAsistentes}>{verificandoIds.length > 0 ? "Guardando confirmaciones..." : `Confirmar asistentes (${seleccionadosPendientes.length})`}</button>
                    </div>
                  </div>
                  {resultadoLote && <p className="vec-batch-result" role="status">{resultadoLote}</p>}
                </section>
              ) : (
                <p className="text-muted">La verificación física solo está disponible para coordinadores.</p>
              )}

              <h4 className="vec-attendance-checklist-title">Lista de asistentes</h4>
              <p className="text-muted">
                Selecciona las personas presentes y pulsa “Confirmar asistentes” para guardar las marcas.
              </p>

              <div className="form-group" style={{ maxWidth: "520px" }}>
                <label className="form-label" htmlFor="vec-buscar-asistente">
                  Filtrar asistentes inscritos por nombre, identificación, código o correo
                </label>
                <input
                  className="form-control"
                  id="vec-buscar-asistente"
                  type="search"
                  value={busquedaAsistente}
                  onChange={(event) => setBusquedaAsistente(event.target.value.slice(0, 100))}
                  maxLength={100}
                  placeholder="Escribe para filtrar los asistentes"
                />
              </div>

              {cargandoAsistentes ? (
                <p className="text-muted" role="status">Consultando asistentes...</p>
              ) : asistentesFiltrados.length === 0 ? (
                <p className="text-muted">
                  {asistentes.length === 0
                    ? "Esta jornada todavía no tiene participantes inscritos."
                    : "No hay asistentes que coincidan con la búsqueda."}
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Confirmar asistencia</th>
                        <th>Periodo</th>
                        <th>Rol en esta actividad</th>
                        <th>Otros roles</th>
                        <th>Identificación</th>
                        <th>Asistente</th>
                        <th>Código</th>
                        <th>Programa / dependencia</th>
                        <th>Correo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistentesFiltrados.map((asistente) => {
                        const roles = asistente.roles || [asistente.rolParticipacion];
                        const multipleRoles = roles.length > 1;
                        return (
                          <tr className={multipleRoles ? "vec-multiple-roles" : undefined} key={asistente.id}>
                            <td>
                              {esCoordinador ? (
                                <label className="vec-attendance-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(asistente.asistenciaVerificada || idsSeleccionados.has(asistente.id))}
                                    onChange={(event) => cambiarSeleccion(asistente, event.target.checked)}
                                    disabled={Boolean(asistente.asistenciaVerificada) || verificandoIds.includes(asistente.id)}
                                    aria-label={`Confirmar asistencia de ${asistente.apellidosNombres || asistente.identificacion}`}
                                  />
                                  <span>{asistente.asistenciaVerificada ? "Confirmada" : idsSeleccionados.has(asistente.id) ? "Seleccionada" : "Pendiente"}</span>
                                </label>
                              ) : (
                                <span>{asistente.asistenciaVerificada ? "Confirmada" : idsSeleccionados.has(asistente.id) ? "Seleccionada" : "Pendiente"}</span>
                              )}
                            </td>
                            <td>{asistente.periodo || "—"}</td>
                            <td>
                              <span className={`vec-role-badge vec-role-${String(asistente.rolParticipacion).toLowerCase()}`}>
                                {ROL_LABELS[asistente.rolParticipacion] || asistente.rolParticipacion}
                              </span>
                            </td>
                            <td>
                              {roles.filter((role) => role !== asistente.rolParticipacion).map((role) => (
                                <span className={`vec-role-badge vec-role-${String(role).toLowerCase()}`} key={role}>
                                  {ROL_LABELS[role] || role}
                                </span>
                              ))}
                            </td>
                            <td>{asistente.identificacion || "—"}</td>
                            <td>{asistente.apellidosNombres || "—"}</td>
                            <td>{asistente.codigo || "—"}</td>
                            <td>{asistente.programaPregrado || asistente.programaPosgrado || "—"}</td>
                            <td>{asistente.correo || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
        </>
      )}
    </section>
  );
}
