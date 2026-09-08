/* ==========================================================================
   Feature: Intervenciones
   Migración real de intervenciones.html + assets/js/intervenciones.js:
   formulario de proceso de escucha con auto-guardado de borrador (RQF04 /
   RNF04, guardado en localStorage — legítimo aquí porque es conveniencia
   por-dispositivo, no un dato que el servidor deba conocer), dropzone de
   evidencias PDF (máx. 5MB, RQF16), casilla de caso sensible VBG y el
   historial ya protegido por RNF01.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { listIntervenciones, crearIntervencion, listEstudiantesParaSelector } from "./api.js";

const DRAFT_KEY = "SAT_UNICESMAG_DRAFT_INTERVENCION";
const ESTADO_INICIAL = { codigoEstudiante: "", motivo: "", resumenAcuerdo: "", esSensibleVBG: false };

function leerBorrador() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function IntervencionesPage() {
  const [searchParams] = useSearchParams();
  const [intervenciones, setIntervenciones] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [form, setForm] = useState({ ...ESTADO_INICIAL, codigoEstudiante: searchParams.get("estudiante") || "" });
  const [adjuntos, setAdjuntos] = useState([]);
  const [borrador, setBorrador] = useState(leerBorrador());
  const [autoguardadoEn, setAutoguardadoEn] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    Promise.all([listIntervenciones(), listEstudiantesParaSelector()])
      .then(([i, e]) => {
        setIntervenciones(i);
        setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
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

  function restaurarBorrador() {
    if (borrador?.data) setForm(borrador.data);
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
    if (!form.codigoEstudiante || !form.motivo || !form.resumenAcuerdo) {
      setError("Diligencie todos los campos requeridos.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearIntervencion({ ...form, adjuntos });
      setIntervenciones((prev) => [nueva, ...prev]);
      setForm(ESTADO_INICIAL);
      setAdjuntos([]);
      descartarBorrador();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppLayout titulo="Registro de Intervenciones y Atención" breadcrumb="Procesos de Escucha / Auto-guardado RQF04">
      {borrador?.data && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-history"></i> Se encontró un borrador pausado del {new Date(borrador.timestamp).toLocaleString()}
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
          <small>{autoguardadoEn.toLocaleTimeString()}</small>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 7" }}>
          <div className="card-header">
            <h3 className="card-title">Formulario de Proceso de Escucha</h3>
            <span className="badge badge-status-process">
              <i className="fas fa-cloud-arrow-up"></i> Auto-guardado Activo
            </span>
          </div>

          <form onSubmit={handleSubmit}>
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
                  setForm(ESTADO_INICIAL);
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

        <div className="card" style={{ gridColumn: "span 5" }}>
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
                {intervenciones.map((i) => (
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
                    <td>{i.fecha}</td>
                    <td>
                      {i.esSensibleVBG ? (
                        <span className="badge badge-risk-high">
                          <i className="fas fa-lock"></i> VBG
                        </span>
                      ) : (
                        <span className="badge badge-risk-low">Ordinaria</span>
                      )}
                    </td>
                    <td>
                      {i.detalleVisible ? (
                        <Link to={`/ficha-estudiante?codigo=${i.codigoEstudiante}`} className="btn btn-outline btn-sm">
                          <i className="fas fa-eye"></i> Ver Ficha
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
      </div>
    </AppLayout>
  );
}
