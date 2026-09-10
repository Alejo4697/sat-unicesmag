/* ==========================================================================
   Feature: Alertas Tempranas
   Migración real de alertas.html + assets/js/alertas.js: formulario de
   alerta manual (RQF15) a la izquierda, registro activo de alertas a la
   derecha, con acción rápida "Iniciar Atención" hacia Intervenciones.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { riskBadgeClass } from "../../shared/utils/risk.js";
import { listAlertas, crearAlerta, listEstudiantesParaSelector } from "./api.js";

const TIPOS = [
  "Emocional / Psicológica",
  "Convivencia y Relaciones",
  "Salud y Enfermedad",
  "Violencia Basada en Género (VBG - RNF01)",
  "Socioeconómica y Transporte",
  "Consumo de Sustancias (SPA)",
  "Académica / Asistencia"
];

const ESTADO_INICIAL = { codigoEstudiante: "", tipo: TIPOS[0], nivelRiesgo: "Alto", descripcion: "" };

export default function AlertasPage() {
  const [alertas, setAlertas] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [form, setForm] = useState(ESTADO_INICIAL);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    Promise.all([listAlertas(), listEstudiantesParaSelector()])
      .then(([a, e]) => {
        setAlertas(a);
        setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigoEstudiante || !form.tipo || !form.descripcion) {
      setError("Complete todos los campos requeridos.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearAlerta(form);
      setAlertas((prev) => [nueva, ...prev]);
      setForm(ESTADO_INICIAL);
      setMensaje(`Alerta temprana registrada exitosamente para el estudiante ${form.codigoEstudiante}.`);
      setTimeout(() => setMensaje(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppLayout titulo="Gestión de Alertas Tempranas" breadcrumb="Alertas Automáticas y Manuales RQF14 RQF15">
      {error && <div className="auth-error">{error}</div>}
      {mensaje && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-circle-check"></i> {mensaje}
          </span>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">Crear Alerta Manual (RQF15)</h3>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="alerta-estudiante">
                Estudiante
              </label>
              <select
                id="alerta-estudiante"
                className="form-select"
                required
                value={form.codigoEstudiante}
                onChange={(e) => setForm({ ...form, codigoEstudiante: e.target.value })}
              >
                <option value="">-- Seleccionar --</option>
                {estudiantes.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombres} {e.apellidos} ({e.programa})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="alerta-tipo">
                Tipología de la Alerta
              </label>
              <select
                id="alerta-tipo"
                className="form-select"
                required
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="alerta-riesgo">
                Nivel de Riesgo
              </label>
              <select
                id="alerta-riesgo"
                className="form-select"
                required
                value={form.nivelRiesgo}
                onChange={(e) => setForm({ ...form, nivelRiesgo: e.target.value })}
              >
                <option value="Alto">Alto 🔴</option>
                <option value="Medio">Medio 🟠</option>
                <option value="Bajo">Bajo 🟢</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="alerta-descripcion">
                Detalle de la Observación
              </label>
              <textarea
                id="alerta-descripcion"
                className="form-control"
                placeholder="Observaciones y hechos detectados..."
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={enviando}>
              <i className="fas fa-bell"></i> {enviando ? "Registrando..." : "Registrar Alerta"}
            </button>
          </form>
        </div>

        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">Registro Activo de Alertas</h3>
            <span className="badge badge-risk-high">Periodo 2025 II</span>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estudiante</th>
                  <th>Tipo / Programa</th>
                  <th>Origen</th>
                  <th>Riesgo</th>
                  <th>Fecha / Creador</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.id}</strong>
                    </td>
                    <td>
                      {a.nombreEstudiante}
                      <br />
                      <small className="text-muted">Cód: {a.codigoEstudiante}</small>
                    </td>
                    <td>
                      <strong>{a.tipo}</strong>
                      <br />
                      <small className="text-muted">{a.programa}</small>
                    </td>
                    <td>
                      <span className={`badge ${a.categoria === "Automática" ? "badge-status-process" : "badge-status-pending"}`}>
                        {a.categoria}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${riskBadgeClass(a.nivelRiesgo)}`}>{a.nivelRiesgo}</span>
                    </td>
                    <td>
                      {a.fechaCreacion}
                      <br />
                      <small className="text-muted">{a.creador}</small>
                    </td>
                    <td>
                      <Link to={`/intervenciones?estudiante=${a.codigoEstudiante}`} className="btn btn-secondary btn-sm">
                        <i className="fas fa-hand-holding-heart"></i> Iniciar Atención
                      </Link>
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
