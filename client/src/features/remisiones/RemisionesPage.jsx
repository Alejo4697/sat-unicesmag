/* ==========================================================================
   Feature: Remisiones
   Migración real de remisiones.html + assets/js/remisiones.js: formulario
   de canalización (RQF17) y bandeja de casos remitidos, con el modal de
   "Gestionar Estado" para actualizar el flujo Generada -> Recibida/Asignada
   -> En Atención -> Atendida y dejar recomendaciones para el aula (RQF18).
   ========================================================================== */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { riskBadgeClass } from "../../shared/utils/risk.js";
import { listRemisiones, crearRemision, actualizarRemision, listEstudiantesParaSelector } from "./api.js";

const AREAS_DESTINO = [
  "Unidad de Servicios Psicológicos (USP)",
  "Trabajo Social",
  "Área de Salud María Goretti / Enfermería",
  "Consultorios Jurídicos",
  "Pastoral Universitaria",
  "Paz y Convivencia",
  "Tutoría Académica Docente"
];

const ESTADOS = ["Generada", "Recibida/Asignada", "En Atención", "Atendida", "Devuelta con Recomendaciones"];

const ESTADO_INICIAL_FORM = { codigoEstudiante: "", areaDestino: AREAS_DESTINO[0], nivelRiesgo: "Medio", motivoRemision: "" };

function estadoBadgeClass(estado) {
  if (estado === "En Atención") return "badge-status-process";
  if (estado === "Atendida" || estado === "Cerrada") return "badge-status-closed";
  return "badge-status-pending";
}

export default function RemisionesPage() {
  const [searchParams] = useSearchParams();
  const [remisiones, setRemisiones] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [form, setForm] = useState({ ...ESTADO_INICIAL_FORM, codigoEstudiante: searchParams.get("estudiante") || "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalRemision, setModalRemision] = useState(null);
  const [modalEstado, setModalEstado] = useState("");
  const [modalRecomendaciones, setModalRecomendaciones] = useState("");

  useEffect(() => {
    Promise.all([listRemisiones(), listEstudiantesParaSelector()])
      .then(([r, e]) => {
        setRemisiones(r);
        setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
  }, []);

  function nombreEstudiante(codigo) {
    const e = estudiantes.find((x) => x.codigo === codigo);
    return e ? `${e.nombres} ${e.apellidos}` : codigo;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.codigoEstudiante || !form.areaDestino || !form.motivoRemision) {
      setError("Por favor complete todos los campos obligatorios.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearRemision(form);
      setRemisiones((prev) => [nueva, ...prev]);
      setForm(ESTADO_INICIAL_FORM);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  function abrirModal(remision) {
    setModalRemision(remision);
    setModalEstado(remision.estado);
    setModalRecomendaciones(remision.recomendacionesAula || "");
  }

  async function guardarEstado() {
    try {
      const actualizada = await actualizarRemision(modalRemision.id, { estado: modalEstado, recomendacionesAula: modalRecomendaciones });
      setRemisiones((prev) => prev.map((r) => (r.id === actualizada.id ? actualizada : r)));
      setModalRemision(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppLayout titulo="Canalización y Remisiones" breadcrumb="Derivación Especializada y Trazabilidad RQF17 RQF18">
      {error && <div className="auth-error">{error}</div>}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="card-header">
            <h3 className="card-title">Generar Remisión</h3>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="remision-estudiante">
                Estudiante
              </label>
              <select
                id="remision-estudiante"
                className="form-select"
                required
                value={form.codigoEstudiante}
                onChange={(e) => setForm({ ...form, codigoEstudiante: e.target.value })}
              >
                <option value="">-- Seleccionar estudiante --</option>
                {estudiantes.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombres} {e.apellidos} ({e.programa})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="remision-area-destino">
                Área Especializada de Destino (RQF17)
              </label>
              <select
                id="remision-area-destino"
                className="form-select"
                required
                value={form.areaDestino}
                onChange={(e) => setForm({ ...form, areaDestino: e.target.value })}
              >
                {AREAS_DESTINO.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="remision-riesgo">
                Nivel de Riesgo del Caso
              </label>
              <select
                id="remision-riesgo"
                className="form-select"
                required
                value={form.nivelRiesgo}
                onChange={(e) => setForm({ ...form, nivelRiesgo: e.target.value })}
              >
                <option value="Medio">Medio 🟠</option>
                <option value="Alto">Alto 🔴 (Escalamiento en 48h hábiles RQF18)</option>
                <option value="Muy Alto">Muy Alto 🔴 (Atención Prioritaria)</option>
                <option value="Bajo">Bajo 🟢</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="remision-motivo">
                Motivo de la Remisión
              </label>
              <textarea
                id="remision-motivo"
                className="form-control"
                placeholder="Justificación técnica de la derivación al área..."
                required
                value={form.motivoRemision}
                onChange={(e) => setForm({ ...form, motivoRemision: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-secondary" style={{ width: "100%" }} disabled={enviando}>
              <i className="fas fa-paper-plane"></i> {enviando ? "Enviando..." : "Enviar Remisión"}
            </button>
          </form>
        </div>

        <div className="card" style={{ gridColumn: "span 7" }}>
          <div className="card-header">
            <h3 className="card-title">Bandeja de Casos Remitidos</h3>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estudiante</th>
                  <th>Área / Profesional</th>
                  <th>Riesgo</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {remisiones.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>{" "}
                      {r.escalado48h && (
                        <span title="Escalado automáticamente a las 48h por Riesgo Alto" style={{ color: "#E74C3C" }}>
                          <i className="fas fa-clock"></i>
                        </span>
                      )}
                    </td>
                    <td>
                      {nombreEstudiante(r.codigoEstudiante)}
                      <br />
                      <small className="text-muted">Cód: {r.codigoEstudiante}</small>
                    </td>
                    <td>
                      <strong style={{ color: "var(--brand-primary)" }}>{r.areaDestino}</strong>
                      <br />
                      <small className="text-muted">{r.profesionalAsignado}</small>
                    </td>
                    <td>
                      <span className={`badge ${riskBadgeClass(r.nivelRiesgo)}`}>{r.nivelRiesgo}</span>
                    </td>
                    <td>
                      <span className={`badge ${estadoBadgeClass(r.estado)}`}>{r.estado}</span>
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => abrirModal(r)}>
                        <i className="fas fa-tasks"></i> Gestionar Estado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalRemision && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalRemision(null)}
        >
          <div className="card" style={{ width: 500, maxWidth: "92%", margin: 0, padding: "2rem" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header" style={{ marginBottom: "1rem" }}>
              <h3 className="card-title">
                <i className="fas fa-exchange-alt"></i> Actualizar Estado de Remisión {modalRemision.id}
              </h3>
              <button onClick={() => setModalRemision(null)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: "0.83rem", marginBottom: "1rem" }}>
              <strong>Motivo de Remisión:</strong> {modalRemision.motivoRemision}
            </p>

            <div className="form-group">
              <label className="form-label">Estado de la Remisión</label>
              <select className="form-select" value={modalEstado} onChange={(e) => setModalEstado(e.target.value)}>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Recomendaciones para el Aula / Docente Acompañante (RQF18)</label>
              <textarea
                className="form-control"
                placeholder="Redacte recomendaciones generales para el aula respetando la reserva psicosocial..."
                value={modalRecomendaciones}
                onChange={(e) => setModalRecomendaciones(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: "1.5rem" }}>
              <button onClick={() => setModalRemision(null)} className="btn btn-outline">
                Cancelar
              </button>
              <button onClick={guardarEstado} className="btn btn-primary">
                Actualizar y Notificar Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
