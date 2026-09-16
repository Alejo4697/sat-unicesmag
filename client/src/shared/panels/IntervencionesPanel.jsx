/* ==========================================================================
   Panel: Intervenciones (embebible)
   ==========================================================================
   El JSX + lógica de la pantalla de Intervenciones, SIN el <AppLayout>, para
   poder reutilizarlo en dos sitios:
     - features/intervenciones/IntervencionesPage.jsx  -> ruta /intervenciones
     - features/seguimiento-estudiantil/FichaEstudiantePage.jsx -> pestaña

   Vive en shared/ (no en features/) porque lo consumen DOS features y la
   regla de dependencia del proyecto prohíbe que una feature importe de otra.
   Usa el cliente HTTP compartido directamente (no un api.js de una feature),
   para no invertir esa misma regla (shared -> feature).

   Props:
     - codigoEstudiante  -> si viene, el panel queda fijado a ese estudiante:
                            oculta el selector y filtra la lista. Si es null,
                            se comporta como la página autónoma (selector +
                            lista completa, y lee ?estudiante= de la URL solo
                            para pre-rellenar el formulario).
     - nombreEstudiante  -> nombre a mostrar cuando el estudiante está fijado.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { formatDateTime, formatTime } from "../utils/formatDateTime.js";

const listIntervenciones = () => apiFetch("/intervenciones");
const crearIntervencion = (data) => apiFetch("/intervenciones", { method: "POST", body: data });
const listEstudiantes = () => apiFetch("/estudiantes");
// Catálogo administrable (schema `sat`): solo devuelve los tipos activos.
// Ver server/src/features/administracion/catalogos.routes.js.
const listTiposIntervencion = () => apiFetch("/intervenciones/tipos");

const DRAFT_KEY = "SAT_UNICESMAG_DRAFT_INTERVENCION";
const ESTADO_INICIAL = { codigoEstudiante: "", tipoIntervencion: "", motivo: "", resumenAcuerdo: "", esSensibleVBG: false };

function leerBorrador() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function IntervencionesPanel({ codigoEstudiante = null, nombreEstudiante = null }) {
  const fijo = codigoEstudiante != null;
  const [searchParams] = useSearchParams();
  const [intervenciones, setIntervenciones] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({
    ...ESTADO_INICIAL,
    codigoEstudiante: codigoEstudiante || searchParams.get("estudiante") || ""
  });
  const [adjuntos, setAdjuntos] = useState([]);
  const [borrador, setBorrador] = useState(leerBorrador());
  const [autoguardadoEn, setAutoguardadoEn] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandidos, setExpandidos] = useState(() => new Set());
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  function toggleExpandido(id) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    // Con estudiante fijo no hace falta la lista completa (no hay selector);
    // el catálogo de tipos sí se necesita siempre (formulario).
    const base = [listIntervenciones(), listTiposIntervencion()];
    const peticiones = fijo ? base : [...base, listEstudiantes()];
    Promise.all(peticiones)
      .then(([i, t, e]) => {
        setIntervenciones(i);
        setTipos(t);
        if (e) setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-guardado de borrador (RQF04 / RNF04): igual que
  // debounceAutoSave() en el mockup, con 1s de espera tras el último cambio.
  useEffect(() => {
    if (!form.motivo && !form.resumenAcuerdo) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ timestamp: new Date().toISOString(), data: form }));
        setAutoguardadoEn(new Date());
      } catch {
        /* localStorage no disponible: se ignora, el auto-guardado es solo conveniencia */
      }
    }, 1000);
    return () => clearTimeout(debounceRef.current);
  }, [form]);

  function formVacio() {
    return { ...ESTADO_INICIAL, codigoEstudiante: codigoEstudiante || "" };
  }

  function restaurarBorrador() {
    if (borrador?.data) {
      // Con estudiante fijo, el borrador no puede cambiar de estudiante.
      setForm(fijo ? { ...borrador.data, codigoEstudiante } : borrador.data);
    }
    setBorrador(null);
  }

  function descartarBorrador() {
    localStorage.removeItem(DRAFT_KEY);
    setBorrador(null);
  }

  function handleFiles(files) {
    const nuevos = [];
    Array.from(files).forEach((file) => {
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        setError(`El archivo ${file.name} no es un PDF válido (Criterio RQF16).`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`El archivo ${file.name} supera el límite máximo permitido de 5MB (Criterio RQF16).`);
        return;
      }
      nuevos.push({ nombre: file.name, tamano: `${(file.size / (1024 * 1024)).toFixed(1)} MB`, url: "#" });
    });
    if (nuevos.length) setAdjuntos((prev) => [...prev, ...nuevos]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const codigo = codigoEstudiante || form.codigoEstudiante;
    if (!codigo || !form.tipoIntervencion || !form.motivo || !form.resumenAcuerdo) {
      setError("Diligencie todos los campos requeridos (incluido el tipo de intervención).");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearIntervencion({ ...form, codigoEstudiante: codigo, adjuntos });
      setIntervenciones((prev) => [nueva, ...prev]);
      setForm(formVacio());
      setAdjuntos([]);
      descartarBorrador();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const intervencionesVisibles = fijo
    ? intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
    : intervenciones;

  return (
    <>
      {borrador?.data && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-history"></i> Se encontró un borrador pausado del {formatDateTime(borrador.timestamp)}
          </span>
          <div>
            <button onClick={restaurarBorrador} className="btn btn-sm btn-gold">
              Restaurar Borrador
            </button>{" "}
            <button onClick={descartarBorrador} className="btn btn-sm btn-outline">
              Descartar
            </button>
          </div>
        </div>
      )}
      {!borrador && autoguardadoEn && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-save"></i> Borrador auto-guardado en este dispositivo (RQF04 / RNF04)
          </span>
          <small>{formatTime(autoguardadoEn)}</small>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">Proceso de Escucha</h3>
            <span className="badge badge-status-process">
              <i className="fas fa-cloud-arrow-up"></i> Auto-guardado Activo
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            {fijo ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
                <i className="fas fa-user-graduate"></i> Registrando intervención para{" "}
                <strong>{nombreEstudiante || codigoEstudiante}</strong>.
              </p>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="intervencion-estudiante">
                  Estudiante a Atender
                </label>
                <select
                  id="intervencion-estudiante"
                  className="form-select"
                  required
                  value={form.codigoEstudiante}
                  onChange={(e) => setForm({ ...form, codigoEstudiante: e.target.value })}
                >
                  <option value="">-- Seleccione estudiante --</option>
                  {estudiantes.map((e) => (
                    <option key={e.codigo} value={e.codigo}>
                      {e.nombres} {e.apellidos} (Cód: {e.codigo} - {e.programa})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="intervencion-tipo">
                Tipo de Intervención
              </label>
              <select
                id="intervencion-tipo"
                className="form-select"
                required
                value={form.tipoIntervencion || ""}
                onChange={(e) => setForm({ ...form, tipoIntervencion: e.target.value })}
              >
                <option value="">-- Seleccione el tipo --</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.nombre}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="intervencion-motivo">
                Motivo de la Atención / Proceso de Escucha
              </label>
              <textarea
                id="intervencion-motivo"
                className="form-control"
                placeholder="Describa el motivo de la consulta, situación académica o psicosocial detectada..."
                required
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="intervencion-acuerdo">
                Resumen de Acuerdos y Compromisos
              </label>
              <textarea
                id="intervencion-acuerdo"
                className="form-control"
                placeholder="Acuerdos establecidos, plan de acompañamiento o compromisos del estudiante..."
                required
                value={form.resumenAcuerdo}
                onChange={(e) => setForm({ ...form, resumenAcuerdo: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Soportes / Actas de Encuentro (PDF máx. 5MB)</label>
              <div
                className={`dropzone${dragOver ? " dragover" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
                }}
              >
                <i className="fas fa-file-arrow-up dropzone-icon"></i>
                <p style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 2 }}>Haz clic o arrastra un archivo PDF</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Formato PDF (máximo 5MB por archivo según Criterio RQF16)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files.length && handleFiles(e.target.files)}
                />
              </div>
              <div className="uploaded-files-list">
                {adjuntos.map((f, index) => (
                  <div className="file-item" key={`${f.nombre}-${index}`}>
                    <span className="file-item-name">
                      <i className="fas fa-file-pdf" style={{ color: "#A6192E" }}></i> {f.nombre} ({f.tamano})
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdjuntos((prev) => prev.filter((_, i) => i !== index))}
                      style={{ background: "none", border: "none", color: "#E74C3C", cursor: "pointer" }}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="form-group"
              style={{ background: "var(--risk-high-bg)", border: "1px solid var(--risk-high-border)", padding: "0.75rem 1rem", borderRadius: 6 }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: "var(--risk-high-text)", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.esSensibleVBG}
                  onChange={(e) => setForm({ ...form, esSensibleVBG: e.target.checked })}
                />
                <span>Marcar como caso sensible VBG (Violencia Basada en Género - Confidencialidad RNF01)</span>
              </label>
              <p style={{ fontSize: "0.725rem", color: "var(--text-muted)", margin: "4px 0 0 22px" }}>
                El detalle será restringido exclusivamente al registrador, Consultorios Jurídicos y Unidad de Servicios Psicológicos.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1.25rem" }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setForm(formVacio());
                  setAdjuntos([]);
                  descartarBorrador();
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                <i className="fas fa-check"></i> {enviando ? "Registrando..." : "Registrar Intervención"}
              </button>
            </div>
          </form>
        </div>

        {fijo ? (
          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="card-header">
              <h3 className="card-title">Historial de Intervenciones del Estudiante</h3>
            </div>
            <div className="timeline">
              {intervencionesVisibles.length === 0 && (
                <p className="page-placeholder">Sin intervenciones registradas.</p>
              )}
              {intervencionesVisibles.map((i) => {
                const expandido = expandidos.has(i.id);
                return (
                  <div className="timeline-item" key={i.id}>
                    <div className={`timeline-node ${i.esSensibleVBG ? "badge-vbg" : ""}`}></div>
                    <div className="timeline-box">
                      <div className="timeline-top">
                        <span className="timeline-user">
                          <strong>{i.id}</strong> — {i.atendidoPor} ({i.cargoAtendio})
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => toggleExpandido(i.id)}
                          aria-expanded={expandido}
                        >
                          <i className={`fas fa-chevron-${expandido ? "up" : "down"}`}></i> {expandido ? "Ver menos" : "Ver más"}
                        </button>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.75rem", color: "var(--text-muted)", margin: "4px 0" }}>
                        <span>
                          <i className="far fa-clock"></i> Atención: {formatDateTime(i.fecha)}
                        </span>
                        <span>
                          <i className="fas fa-clipboard-check"></i> Registro: {formatDateTime(i.fechaRegistro)}
                        </span>
                        <span>
                          <i className="fas fa-tag"></i> {i.tipoIntervencion || "—"}
                        </span>
                      </div>

                      {i.esSensibleVBG && (
                        <div className="badge badge-risk-high" style={{ marginBottom: 8 }}>
                          <i className="fas fa-lock"></i> Caso Sensible VBG
                        </div>
                      )}

                      {expandido &&
                        (i.detalleVisible ? (
                          <>
                            <p>
                              <strong>Motivo:</strong> {i.motivo}
                            </p>
                            <p style={{ marginTop: 4 }}>
                              <strong>Acuerdos/Compromisos:</strong> {i.resumenAcuerdo}
                            </p>
                            {i.adjuntos.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <small>
                                  <strong>Evidencias Adjuntas:</strong>
                                </small>
                                <div>
                                  {i.adjuntos.map((a) => (
                                    <a
                                      href="#"
                                      key={a.nombre}
                                      onClick={(e) => e.preventDefault()}
                                      className="btn btn-outline btn-sm"
                                      style={{ marginTop: 4, marginRight: 4, display: "inline-flex", alignItems: "center", gap: 4 }}
                                    >
                                      <i className="fas fa-file-pdf" style={{ color: "#A6192E" }}></i> {a.nombre} ({a.tamano})
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="confidential-banner">
                            <i className="fas fa-user-shield confidential-icon"></i>
                            <div>
                              <strong>
                                {i.esSensibleVBG
                                  ? "INFORMACIÓN RESTRINGIDA POR SECRETO PROFESIONAL (RNF01)"
                                  : "DETALLE RESTRINGIDO AL PROFESIONAL REGISTRADOR"}
                              </strong>
                              <p style={{ fontSize: "0.75rem", margin: 0 }}>
                                {i.esSensibleVBG
                                  ? "El detalle de este caso de VBG está protegido. Solo es accesible para el profesional registrador, Consultorios Jurídicos y USP."
                                  : "El motivo, los acuerdos y los adjuntos de esta intervención solo son visibles para el profesional que la registró."}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card" style={{ gridColumn: "span 12" }}>
            <div className="card-header">
              <h3 className="card-title">Intervenciones Registradas</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Estudiante</th>
                    <th>Profesional</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {intervencionesVisibles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-muted" style={{ textAlign: "center" }}>
                        Sin intervenciones registradas.
                      </td>
                    </tr>
                  )}
                  {intervencionesVisibles.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.id}</strong>
                      </td>
                      <td>
                        <small className="text-muted">Cód: {i.codigoEstudiante}</small>
                      </td>
                      <td>
                        {i.atendidoPor}
                        <br />
                        <small className="text-muted">{i.cargoAtendio}</small>
                      </td>
                      <td>{formatDateTime(i.fecha)}</td>
                      <td>
                        {i.tipoIntervencion || <span className="text-muted">—</span>}
                        {i.esSensibleVBG && (
                          <div style={{ marginTop: 3 }}>
                            <span className="badge badge-risk-high">
                              <i className="fas fa-lock"></i> VBG
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        {i.detalleVisible ? (
                          <Link
                            to={`/ficha-estudiante?codigo=${i.codigoEstudiante}`}
                            className="btn btn-outline btn-sm"
                            title="Ver Ficha"
                            aria-label="Ver Ficha"
                          >
                            <i className="fas fa-eye"></i>
                          </Link>
                        ) : (
                          <span className="badge badge-risk-high">
                            <i className="fas fa-eye-slash"></i> Protegido
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
