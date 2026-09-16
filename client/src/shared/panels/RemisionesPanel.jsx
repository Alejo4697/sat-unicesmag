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

   Destino de la remisión (Matriz de Bienestar, GET /remisiones/rutas):
     1) Tipo de apoyo (Apoyo 1..5)
     2) Servicio / proyecto, agrupado por programa
     -> la oficina y el profesional responsable los deduce el servidor.
   La opción "Otra área (remisión directa)" solo lista las áreas activas que
   no tienen rutas en la matriz (p. ej. Consultorios Jurídicos).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
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
const listRutasRemision = () => apiFetch("/remisiones/rutas");

const DIRECTA = "directa";

const ESTADO_INICIAL_FORM = {
  codigoEstudiante: "",
  tipoApoyo: "",
  idRuta: "",
  areaDestino: "",
  nivelRiesgo: "Medio",
  motivoRemision: ""
};

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
  const [rutas, setRutas] = useState([]);
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
    const base = [listRemisiones(), listAreasRemision(), listEstadosRemision(), listRutasRemision()];
    const peticiones = fijo ? base : [...base, listEstudiantes()];
    Promise.all(peticiones)
      .then(([r, a, es, ru, e]) => {
        setRemisiones(r);
        setAreas(a);
        setEstados(es);
        setRutas(ru);
        if (e) setEstudiantes(e);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tipos de apoyo presentes en la matriz, en orden (Apoyo 1..5).
  const tiposApoyo = useMemo(() => {
    const vistos = new Map();
    rutas.forEach((r) => vistos.set(String(r.tipoApoyoNumero), r.tipoApoyo));
    return [...vistos.entries()].map(([numero, nombre]) => ({ numero, nombre }));
  }, [rutas]);

  // Servicios del tipo de apoyo elegido, agrupados por programa.
  const programasDelApoyo = useMemo(() => {
    const grupos = new Map();
    rutas
      .filter((r) => String(r.tipoApoyoNumero) === form.tipoApoyo)
      .forEach((r) => {
        if (!grupos.has(r.programa)) grupos.set(r.programa, []);
        grupos.get(r.programa).push(r);
      });
    return [...grupos.entries()];
  }, [rutas, form.tipoApoyo]);

  const areasDirectas = areas.filter((a) => !a.tieneRutas);
  const rutaSeleccionada = rutas.find((r) => r.id === form.idRuta) || null;
  const esDirecta = form.tipoApoyo === DIRECTA;

  function nombreDeEstudiante(codigo) {
    if (fijo && codigo === codigoEstudiante) return nombreEstudiante || codigo;
    const e = estudiantes.find((x) => x.codigo === codigo);
    return e ? `${e.nombres} ${e.apellidos}` : codigo;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const codigo = codigoEstudiante || form.codigoEstudiante;
    const destinoOk = esDirecta ? !!form.areaDestino : !!form.idRuta;
    if (!codigo || !destinoOk || !form.motivoRemision) {
      setError("Por favor complete todos los campos obligatorios.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const payload = {
        codigoEstudiante: codigo,
        nivelRiesgo: form.nivelRiesgo,
        motivoRemision: form.motivoRemision,
        ...(esDirecta ? { areaDestino: form.areaDestino } : { idRuta: form.idRuta })
      };
      const nueva = await crearRemision(payload);
      setRemisiones((prev) => [nueva, ...prev]);
      setForm({ ...ESTADO_INICIAL_FORM, codigoEstudiante: codigoEstudiante || "" });
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
              <label className="form-label" htmlFor="remision-tipo-apoyo">
                Tipo de Apoyo (RQF17)
              </label>
              <select
                id="remision-tipo-apoyo"
                className="form-select"
                required
                value={form.tipoApoyo}
                onChange={(e) => setForm({ ...form, tipoApoyo: e.target.value, idRuta: "", areaDestino: "" })}
              >
                <option value="">-- Seleccionar tipo de apoyo --</option>
                {tiposApoyo.map((t) => (
                  <option key={t.numero} value={t.numero}>
                    Apoyo {t.numero}: {t.nombre}
                  </option>
                ))}
                {areasDirectas.length > 0 && <option value={DIRECTA}>Otra área (remisión directa)</option>}
              </select>
            </div>

            {form.tipoApoyo && !esDirecta && (
              <div className="form-group">
                <label className="form-label" htmlFor="remision-ruta">
                  Programa / Servicio
                </label>
                <select
                  id="remision-ruta"
                  className="form-select"
                  required
                  value={form.idRuta}
                  onChange={(e) => setForm({ ...form, idRuta: e.target.value })}
                >
                  <option value="">-- Seleccionar servicio --</option>
                  {programasDelApoyo.map(([programa, servicios]) => (
                    <optgroup key={programa} label={programa}>
                      {servicios.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.proyecto}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {esDirecta && (
              <div className="form-group">
                <label className="form-label" htmlFor="remision-area-destino">
                  Área de Destino
                </label>
                <select
                  id="remision-area-destino"
                  className="form-select"
                  required
                  value={form.areaDestino}
                  onChange={(e) => setForm({ ...form, areaDestino: e.target.value })}
                >
                  <option value="">-- Seleccionar área --</option>
                  {areasDirectas.map((a) => (
                    <option key={a.id} value={a.nombre}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {rutaSeleccionada && (
              <div
                style={{ fontSize: "0.8rem", background: "var(--bg-body, #f5f7fa)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", lineHeight: 1.6 }}
              >
                <div><strong>Línea de acción:</strong> {rutaSeleccionada.lineaAccion}</div>
                <div><strong>Componente:</strong> {rutaSeleccionada.componente}</div>
                <div><strong>Programa:</strong> {rutaSeleccionada.programa}</div>
                <div>
                  <strong>Se remite a:</strong> {rutaSeleccionada.oficina}
                  {" — "}
                  {rutaSeleccionada.profesionalResponsable || "Profesional por asignar"}
                </div>
              </div>
            )}

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
                      {r.programa && (
                        <>
                          <br />
                          <small>
                            {r.programa}
                            {r.proyecto && r.proyecto !== r.programa ? ` › ${r.proyecto}` : ""}
                          </small>
                        </>
                      )}
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

            {modalRemision.tipoApoyo && (
              <p style={{ fontSize: "0.83rem", marginBottom: "0.5rem" }}>
                <strong>{modalRemision.tipoApoyo}</strong> · {modalRemision.programa} › {modalRemision.proyecto}
              </p>
            )}

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
