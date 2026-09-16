/* ==========================================================================
   Feature: Alertas Tempranas
   Formulario de alerta manual (RQF15) con búsqueda directa por
   Cédula o Código Institucional (sin selector dropdown) y registro activo.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { riskBadgeClass } from "../../shared/utils/risk.js";
import { formatDateTime } from "../../shared/utils/formatDateTime.js";
import { listAlertas, crearAlerta, getEstudiante } from "./api.js";

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

// Ícono por nivel, consistente con el resto de la app (ej. badge de "Riesgo
// Global" en Ficha 360° y los iconos KPI del Tablero). Local a esta pantalla:
// no se tocó risk.js porque ese archivo lo comparten Ficha 360°, Remisiones
// y Caracterización.
function riskIconClass(nivel) {
  if (nivel === "Alto" || nivel === "Muy Alto") return "fa-circle-exclamation";
  if (nivel === "Medio") return "fa-triangle-exclamation";
  return "fa-circle-check";
}

// Badge de riesgo más grande SOLO en esta tabla (estilo inline, no toca la
// clase .badge base que usan las demás pantallas).
const BADGE_RIESGO_LG = { fontSize: "0.85rem", padding: "0.35rem 0.85rem" };

export default function AlertasPage() {
  const [alertas, setAlertas] = useState([]);
  const [form, setForm] = useState(ESTADO_INICIAL);
  
  // Búsqueda de estudiante por código o cédula
  const [busquedaEstudiante, setBusquedaEstudiante] = useState("");
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState(null);
  const [buscandoEstudiante, setBuscandoEstudiante] = useState(false);
  const [errorEstudiante, setErrorEstudiante] = useState("");

  // Filtro de búsqueda en la tabla de alertas
  const [filtroTabla, setFiltroTabla] = useState("");

  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    listAlertas()
      .then((a) => setAlertas(a))
      .catch((err) => setError(err.message));
  }, []);

  async function handleBuscarEstudiante(e) {
    if (e) e.preventDefault();
    const q = busquedaEstudiante.trim();
    if (!q) {
      setErrorEstudiante("Por favor ingresa un código estudiantil o número de cédula.");
      return;
    }

    setBuscandoEstudiante(true);
    setErrorEstudiante("");
    try {
      const est = await getEstudiante(q);
      if (est && est.codigo) {
        setEstudianteSeleccionado(est);
        setForm((prev) => ({ ...prev, codigoEstudiante: est.codigo }));
        setErrorEstudiante("");
      } else {
        setEstudianteSeleccionado(null);
        setForm((prev) => ({ ...prev, codigoEstudiante: "" }));
        setErrorEstudiante("No se encontró ningún estudiante con ese código o cédula.");
      }
    } catch {
      setEstudianteSeleccionado(null);
      setForm((prev) => ({ ...prev, codigoEstudiante: "" }));
      setErrorEstudiante("No se encontró ningún estudiante con el código o cédula ingresada.");
    } finally {
      setBuscandoEstudiante(false);
    }
  }

  function handleLimpiarEstudiante() {
    setEstudianteSeleccionado(null);
    setBusquedaEstudiante("");
    setErrorEstudiante("");
    setForm((prev) => ({ ...prev, codigoEstudiante: "" }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!estudianteSeleccionado || !form.codigoEstudiante) {
      setError("Debes buscar y seleccionar un estudiante antes de registrar la alerta.");
      return;
    }
    if (!form.tipo || !form.descripcion.trim()) {
      setError("Complete todos los campos requeridos.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nueva = await crearAlerta(form);
      setAlertas((prev) => [nueva, ...prev]);
      setForm(ESTADO_INICIAL);
      handleLimpiarEstudiante();
      setMensaje(
        `Alerta temprana registrada exitosamente para ${nueva.nombreEstudiante} (Cód: ${nueva.codigoEstudiante}).`
      );
      setTimeout(() => setMensaje(""), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  // Filtrado de alertas activas
  const alertasFiltradas = useMemo(() => {
    if (!filtroTabla.trim()) return alertas;
    const term = filtroTabla.toLowerCase().trim();
    return alertas.filter(
      (a) =>
        (a.id && a.id.toLowerCase().includes(term)) ||
        (a.nombreEstudiante && a.nombreEstudiante.toLowerCase().includes(term)) ||
        (a.codigoEstudiante && String(a.codigoEstudiante).toLowerCase().includes(term)) ||
        (a.documentoEstudiante && String(a.documentoEstudiante).toLowerCase().includes(term)) ||
        (a.tipo && a.tipo.toLowerCase().includes(term)) ||
        (a.programa && a.programa.toLowerCase().includes(term))
    );
  }, [alertas, filtroTabla]);

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
        {/* Formulario de Creación de Alerta Manual */}
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="card-header">
            <h3 className="card-title">Crear Alerta Manual (RQF15)</h3>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Buscador de estudiante por Cédula o Código */}
            <div className="form-group">
              <label className="form-label" htmlFor="identificador-estudiante">
                Buscar Estudiante (Código Institucional o Cédula)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  id="identificador-estudiante"
                  className="form-control"
                  placeholder="Ingresa código (ej. 220109009) o cédula (ej. 1085001009)..."
                  value={busquedaEstudiante}
                  onChange={(e) => {
                    setBusquedaEstudiante(e.target.value);
                    if (errorEstudiante) setErrorEstudiante("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBuscarEstudiante();
                    }
                  }}
                  disabled={buscandoEstudiante || Boolean(estudianteSeleccionado)}
                />
                {estudianteSeleccionado ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleLimpiarEstudiante}
                    title="Cambiar de estudiante"
                    style={{ whiteSpace: "nowrap", height: "38px" }}
                  >
                    <i className="fas fa-xmark"></i> Cambiar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleBuscarEstudiante}
                    disabled={buscandoEstudiante || !busquedaEstudiante.trim()}
                    style={{ whiteSpace: "nowrap", height: "38px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <i className={`fas ${buscandoEstudiante ? "fa-spinner fa-spin" : "fa-magnifying-glass"}`}></i>
                    <span>{buscandoEstudiante ? "Buscando..." : "Buscar"}</span>
                  </button>
                )}
              </div>

              {errorEstudiante && (
                <div style={{ color: "var(--risk-high-text, #ef4444)", fontSize: "0.8rem", marginTop: 6, fontWeight: 500 }}>
                  <i className="fas fa-circle-exclamation"></i> {errorEstudiante}
                </div>
              )}

              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                Sugerencias de prueba en Base de Datos: <code>220109009</code> (Santiago Villota - CC <code>1085001009</code>),{" "}
                <code>220109988</code> (Carlos Gómez - CC <code>1085999888</code>), <code>220109010</code> (Estudiante de Prueba)
              </div>
            </div>

            {/* Ficha rápida de estudiante encontrado */}
            {estudianteSeleccionado && (
              <div
                style={{
                  background: "var(--surface-sunken, #f8fafc)",
                  border: "1px solid var(--border-light, #e2e8f0)",
                  borderRadius: "8px",
                  padding: "0.85rem 1.1rem",
                  marginBottom: "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "var(--brand-primary, #002855)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      flexShrink: 0
                    }}
                  >
                    <i className="fas fa-user-graduate"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)" }}>
                      {estudianteSeleccionado.nombres} {estudianteSeleccionado.apellidos}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        marginTop: 2
                      }}
                    >
                      <span>
                        <i className="fas fa-id-card"></i> Cód: <strong>{estudianteSeleccionado.codigo}</strong>
                      </span>
                      {estudianteSeleccionado.documento && (
                        <span>
                          <i className="fas fa-address-card"></i> CC: <strong>{estudianteSeleccionado.documento}</strong>
                        </span>
                      )}
                      <span>
                        <i className="fas fa-building-columns"></i> {estudianteSeleccionado.programa}
                      </span>
                      <span>
                        <i className="fas fa-calendar"></i> Sem: {estudianteSeleccionado.semestre}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className={`badge ${riskBadgeClass(estudianteSeleccionado.riesgoGlobal || "Medio")}`}>
                    Riesgo: {estudianteSeleccionado.riesgoGlobal || "Sin evaluar"}
                  </span>
                </div>
              </div>
            )}

            {/* Tipología de la Alerta */}
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

            {/* Nivel de Riesgo */}
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

            {/* Detalle de la Observación */}
            <div className="form-group">
              <label className="form-label" htmlFor="alerta-descripcion">
                Detalle de la Observación
              </label>
              <textarea
                id="alerta-descripcion"
                className="form-control"
                placeholder="Observaciones y hechos detectados..."
                rows={3}
                required
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", height: "42px", fontWeight: 600 }}
              disabled={enviando || !estudianteSeleccionado}
            >
              <i className="fas fa-bell"></i> {enviando ? "Registrando Alerta..." : "Registrar Alerta"}
            </button>
          </form>
        </div>

        {/* Listado de Alertas Activas con Buscador */}
        <div className="card" style={{ gridColumn: "span 12" }}>
          <div
            className="card-header"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Registro Activo de Alertas</h3>
              <span className="badge badge-risk-high" style={{ marginTop: 4 }}>Periodo 2025 II</span>
            </div>

            {/* Buscador en la tabla */}
            <div style={{ minWidth: 260 }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Filtrar por estudiante, cédula, código o tipo..."
                value={filtroTabla}
                onChange={(e) => setFiltroTabla(e.target.value)}
                style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Estudiante</th>
                  <th>Riesgo</th>
                  <th>Tipo / Programa</th>
                  <th>Origen</th>
                  <th>Fecha / Creador</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {alertasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                      No se encontraron alertas registradas con ese criterio.
                    </td>
                  </tr>
                )}
                {alertasFiltradas.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.id}</strong>
                    </td>
                    <td>
                      <strong>{a.nombreEstudiante}</strong>
                      <br />
                      <small className="text-muted">
                        Cód: {a.codigoEstudiante}
                        {a.documentoEstudiante ? ` | CC: ${a.documentoEstudiante}` : ""}
                      </small>
                    </td>
                    <td>
                      <span className={`badge ${riskBadgeClass(a.nivelRiesgo)}`} style={BADGE_RIESGO_LG}>
                        <i className={`fas ${riskIconClass(a.nivelRiesgo)}`}></i> {a.nivelRiesgo}
                      </span>
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
                      {formatDateTime(a.fechaCreacion)}
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

