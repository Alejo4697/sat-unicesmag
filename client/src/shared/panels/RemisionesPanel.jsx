/* ==========================================================================
   Panel: Remisiones (embebible)
   ==========================================================================
   El JSX + lógica de la pantalla de Remisiones, SIN el <AppLayout>, para
   reutilizarlo en:
     - features/remisiones/RemisionesPage.jsx           -> ruta /remisiones
     - features/seguimiento-estudiantil/FichaEstudiantePage.jsx -> pestaña

   Igual que IntervencionesPanel: vive en shared/ porque lo usan dos features
   y usa el cliente HTTP compartido directamente. Ver ese archivo para el
   detalle de las props.

   Props:
     - codigoEstudiante  -> si viene, el panel queda fijado a ese estudiante
                            (oculta el selector, filtra la bandeja).
     - nombreEstudiante  -> nombre a mostrar cuando está fijado.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { riskBadgeClass } from "../utils/risk.js";

const listRemisiones = () => apiFetch("/remisiones");
const crearRemision = (data) => apiFetch("/remisiones", { method: "POST", body: data });
const actualizarRemision = (id, data) => apiFetch(`/remisiones/${id}`, { method: "PATCH", body: data });
const listEstudiantes = () => apiFetch("/estudiantes");
// Catálogos administrables (schema `sat`): solo devuelven los ítems activos.
// Ver server/src/features/administracion/catalogos.routes.js.
const listAreasRemision = () => apiFetch("/remisiones/areas");
const listEstadosRemision = () => apiFetch("/remisiones/estados");

const ESTADO_INICIAL_FORM = { codigoEstudiante: "", areaDestino: "", nivelRiesgo: "Medio", motivoRemision: "" };

function estadoBadgeClass(estado) {
  if (estado === "En Atención") return "badge-status-process";
  if (estado === "Atendida" || estado === "Cerrada") return "badge-status-closed";
  return "badge-status-pending";
}

export default function RemisionesPanel({ codigoEstudiante = null, nombreEstudiante = null }) {
  const fijo = codigoEstudiante != null;
  const [searchParams] = useSearchParams();
  const [remisiones, setRemisiones] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [form, setForm] = useState({
    ...ESTADO_INICIAL_FORM,
    codigoEstudiante: codigoEstudiante || searchParams.get("estudiante") || ""
  });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modalRemision, setModalRemision] = useState(null);
  const [modalEstado, setModalEstado] = useState("");
  const [modalRecomendaciones, setModalRecomendaciones] = useState("");

  useEffect(() => {
    const base = [listRemisiones(), listAreasRemision(), listEstadosRemision()];
    const peticiones = fijo ? base : [...base, listEstudiantes()];
    Promise.all(peticiones)
      .then(([r, a, es, e]) => {
        setRemisiones(r);
        setAreas(a);
        setEstados(es);
        // Preselecciona la primera área activa (antes se preseleccionaba
        // AREAS_DESTINO[0], que estaba hardcodeado).
        setForm((prev) => (prev.areaDestino ? prev : { ...prev, areaDestino: a[0]?.nombre || "" }));
        if (e) setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nombreDeEstudiante(codigo) {
    if (fijo && codigo === codigoEstudiante) return nombreEstudiante || codigo;
    const e = estudiantes.find((x) => x.codigo === codigo);
    return e ? `${e.nombres} ${e.apellidos}` : codigo;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const codigo = codigoEstudiante || form.codigoEstudiante;
    if (!codigo || !form.areaDestino || !form.motivoRemision) {
      setError("Por favor complete todos los campos obligatorios.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearRemision({ ...form, codigoEstudiante: codigo });
      setRemisiones((prev) => [nueva, ...prev]);
      setForm({ ...ESTADO_INICIAL_FORM, areaDestino: areas[0]?.nombre || "", codigoEstudiante: codigoEstudiante || "" });
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

  const remisionesVisibles = fijo
    ? remisiones.filter((r) => r.codigoEstudiante === codigoEstudiante)
    : remisiones;

  // Opciones del modal "Gestionar Estado": los estados activos del catálogo,
  // más el estado actual de la remisión si quedó inhabilitado (para no
  // perderlo ni bloquear el guardado de los demás campos).
  const opcionesEstado =
    modalRemision && !estados.some((e) => e.nombre === modalRemision.estado)
      ? [...estados, { id: "actual", nombre: modalRemision.estado, inhabilitado: true }]
      : estados;

  return (
    <>
      {error && <div className="auth-error">{error}</div>}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">Generar Remisión</h3>
          </div>

          <form onSubmit={handleSubmit}>
            {fijo ? (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
                <i className="fas fa-user-graduate"></i> Generando remisión para{" "}
                <strong>{nombreEstudiante || codigoEstudiante}</strong>.
              </p>
            ) : (
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
            )}

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
                <option value="">-- Seleccionar área --</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.nombre}>
                    {a.nombre}
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

        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">{fijo ? "Remisiones del Estudiante" : "Bandeja de Casos Remitidos"}</h3>
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
                {remisionesVisibles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted" style={{ textAlign: "center" }}>
                      Sin remisiones registradas.
                    </td>
                  </tr>
                )}
                {remisionesVisibles.map((r) => (
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
                      {nombreDeEstudiante(r.codigoEstudiante)}
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
                {opcionesEstado.map((estado) => (
                  <option key={estado.id} value={estado.nombre}>
                    {estado.nombre}
                    {estado.inhabilitado ? " (inhabilitado)" : ""}
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
    </>
  );
}
