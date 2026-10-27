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
const buscarEstudiantesRemision = (q) => apiFetch(`/remisiones/buscar-estudiante?q=${encodeURIComponent(q)}`);
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

// Reemplaza separadores " + ", " - " (o " + - ") por comas en los nombres de servicio.
const formatearProyecto = (nombre) =>
  String(nombre || "").replace(/\s+[+-](?:\s+[+-])*\s+/g, ", ");

export default function RemisionesPanel({ codigoEstudiante = null, nombreEstudiante = null }) {
  const fijo = codigoEstudiante != null;
  const [searchParams] = useSearchParams();
  const [remisiones, setRemisiones] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [estados, setEstados] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [busquedaEstudiante, setBusquedaEstudiante] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState(null);
  const [busquedaEjecutada, setBusquedaEjecutada] = useState(false);
  const [filtroBandeja, setFiltroBandeja] = useState("");
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

  // Búsqueda de estudiantes por código estudiantil (por seguridad institucional)
  const ejecutarBusquedaEstudiante = async (termino) => {
    const q = String(termino !== undefined ? termino : busquedaEstudiante).trim();
    if (!q) {
      setResultadosBusqueda([]);
      setBusquedaEjecutada(false);
      return;
    }
    setBuscando(true);
    setBusquedaEjecutada(true);
    setError("");
    try {
      const res = await buscarEstudiantesRemision(q);
      setResultadosBusqueda(res);
      // Selección automática: coincidencia exacta por documento o código, o resultado único.
      if (!estudianteSeleccionado) {
        const exacto = res.find(
          (x) => String(x.documento || "").trim() === q || String(x.codigo || "").trim() === q
        );
        if (exacto) {
          seleccionarEstudiante(exacto);
        } else if (res.length === 1) {
          seleccionarEstudiante(res[0]);
        }
      }
    } catch (err) {
      console.warn("Fallo en búsqueda:", err.message);
      setResultadosBusqueda([]);
    } finally {
      setBuscando(false);
    }
  };

  // Debounce para búsqueda automática por código estudiantil
  useEffect(() => {
    if (fijo || estudianteSeleccionado) return;
    const term = busquedaEstudiante.trim();
    if (term.length < 3) {
      setResultadosBusqueda([]);
      setBusquedaEjecutada(false);
      return;
    }
    const timer = setTimeout(() => {
      ejecutarBusquedaEstudiante(term);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaEstudiante]);

  // Si viene estudiante fijado o por parámetro, pre-cargar sus datos
  useEffect(() => {
    const cod = codigoEstudiante || searchParams.get("estudiante");
    if (cod && !estudianteSeleccionado) {
      buscarEstudiantesRemision(cod)
        .then((res) => {
          if (res && res.length > 0) {
            setEstudianteSeleccionado(res[0]);
            setForm((prev) => ({ ...prev, codigoEstudiante: res[0].codigo }));
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoEstudiante, searchParams]);

  function seleccionarEstudiante(est) {
    setEstudianteSeleccionado(est);
    setForm((prev) => ({ ...prev, codigoEstudiante: est.codigo }));
    setResultadosBusqueda([]);
    setBusquedaEstudiante("");
    setBusquedaEjecutada(false);
  }

  function deseleccionarEstudiante() {
    setEstudianteSeleccionado(null);
    setForm((prev) => ({ ...prev, codigoEstudiante: "" }));
    setBusquedaEstudiante("");
    setResultadosBusqueda([]);
    setBusquedaEjecutada(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const codigo = codigoEstudiante || form.codigoEstudiante;
    const destinoOk = esDirecta ? !!form.areaDestino : !!form.idRuta;
    if (!codigo || !destinoOk || !form.motivoRemision) {
      setError("Por favor seleccione un estudiante por su código estudiantil y complete los campos obligatorios.");
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
      window.dispatchEvent(new Event("sat:casos-updated"));
      setForm({ ...ESTADO_INICIAL_FORM, codigoEstudiante: codigoEstudiante || "" });
      if (!fijo) {
        deseleccionarEstudiante();
      }
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
      window.dispatchEvent(new Event("sat:casos-updated"));
      setModalRemision(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const remisionesVisibles = fijo
    ? remisiones.filter((r) => r.codigoEstudiante === codigoEstudiante)
    : remisiones;

  // Filtrado de bandeja por código estudiantil, cédula o nombre
  const remisionesFiltradas = useMemo(() => {
    const q = filtroBandeja.trim().toLowerCase();
    const qClean = q.replace(/[^0-9a-zA-Z]/g, "");
    if (!q) return remisionesVisibles;

    return remisionesVisibles.filter((r) => {
      const cod = String(r.codigoEstudiante || "").toLowerCase();
      const doc = String(r.documentoEstudiante || "").toLowerCase().replace(/[^0-9a-zA-Z]/g, "");
      const nom = String(r.nombreEstudiante || nombreDeEstudiante(r.codigoEstudiante) || "").toLowerCase();
      const area = String(r.areaDestino || "").toLowerCase();
      const prof = String(r.profesionalAsignado || "").toLowerCase();
      const idStr = String(r.id || "").toLowerCase();

      return cod.includes(q) ||
             (qClean && doc.includes(qClean)) ||
             nom.includes(q) ||
             area.includes(q) ||
             prof.includes(q) ||
             idStr.includes(q);
    });
  }, [remisionesVisibles, filtroBandeja, estudiantes]);

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
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
                <i className="fas fa-user-graduate"></i> Generando remisión para{" "}
                <strong>{nombreEstudiante || codigoEstudiante}</strong>.
              </p>
            ) : estudianteSeleccionado ? (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "1rem 1.25rem",
                  marginBottom: "1.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      background: "#16a34a",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      flexShrink: 0
                    }}
                  >
                    <i className="fas fa-user-check"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "#14532d" }}>
                      {estudianteSeleccionado.nombreCompleto}
                    </div>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "0.8rem", color: "#166534", marginTop: "3px" }}>
                      <span><i className="fas fa-barcode"></i> Código: <strong>{estudianteSeleccionado.codigo}</strong></span>
                      {estudianteSeleccionado.documento && (
                        <span><i className="fas fa-id-card"></i> Cédula: <strong>{estudianteSeleccionado.documento}</strong></span>
                      )}
                      <span><i className="fas fa-graduation-cap"></i> {estudianteSeleccionado.programa} (Semestre {estudianteSeleccionado.semestre || "1"})</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={deseleccionarEstudiante}
                  className="btn btn-outline btn-sm"
                  style={{ borderColor: "#15803d", color: "#15803d", fontWeight: 600 }}
                  title="Cambiar estudiante"
                >
                  <i className="fas fa-rotate"></i> Cambiar Estudiante
                </button>
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label className="form-label" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="fas fa-barcode text-primary"></i>
                  Buscar Estudiante por Código o Documento de Identidad
                  <span style={{ color: "#e11d48" }}>*</span>
                </label>
                
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ingresa el código o documento del estudiante (ej. 1221104037)..."
                      value={busquedaEstudiante}
                      onChange={(e) => setBusquedaEstudiante(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          ejecutarBusquedaEstudiante();
                        }
                      }}
                      style={{ paddingRight: "36px" }}
                    />
                    {buscando && (
                      <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }}>
                        <i className="fas fa-spinner fa-spin"></i>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => ejecutarBusquedaEstudiante()}
                    disabled={buscando || !busquedaEstudiante.trim()}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
                  >
                    <i className="fas fa-search"></i> Buscar
                  </button>
                </div>

                <div style={{ marginTop: "4px", fontSize: "0.75rem", color: "#64748b" }}>
                  La búsqueda se realiza exclusivamente ingresando el código del estudiante o documento de identidad.
                </div>

                {/* Lista desplegable de resultados encontrados */}
                {resultadosBusqueda.length > 0 && (
                  <div
                    style={{
                    marginTop: "8px",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                    maxHeight: "260px",
                    overflowY: "auto",
                    zIndex: 20
                  }}
                >
                  <div style={{ padding: "6px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>
                    {resultadosBusqueda.length} estudiante(s) con código coincidente — Haz clic para seleccionar:
                  </div>
                  {resultadosBusqueda.map((est) => (
                    <div
                      key={est.id || est.codigo}
                      onClick={() => seleccionarEstudiante(est)}
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f9ff")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div>
                        <strong style={{ color: "#002855", fontSize: "0.9rem" }}>{est.nombreCompleto}</strong>
                        <div style={{ display: "flex", gap: "10px", fontSize: "0.78rem", color: "#64748b", marginTop: "2px", flexWrap: "wrap" }}>
                          <span><i className="fas fa-barcode"></i> Cód: <strong>{est.codigo}</strong></span>
                          <span><i className="fas fa-graduation-cap"></i> {est.programa}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                      >
                        Seleccionar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {busquedaEjecutada && !buscando && resultadosBusqueda.length === 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "10px 14px",
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: "6px",
                    color: "#9f1239",
                    fontSize: "0.825rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  <i className="fas fa-circle-exclamation"></i>
                  <span>No se encontró ningún estudiante con el código "<strong>{busquedaEstudiante}</strong>". Verifica los dígitos del código e intenta nuevamente.</span>
                </div>
              )}
            </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="remision-tipo-apoyo">
                Tipo de Apoyo
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
                          {formatearProyecto(r.proyecto)}
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
                <option value="Medio">Medio</option>
                <option value="Alto">Alto (Escalamiento en 48h hábiles)</option>
                <option value="Muy Alto">Muy Alto (Atención Prioritaria)</option>
                <option value="Bajo">Bajo</option>
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
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <h3 className="card-title" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <span>{fijo ? "Remisiones del Estudiante" : "Bandeja de Casos Remitidos"}</span>
              <span
                className="badge"
                title="Remisiones pendientes por atender"
                style={{
                  backgroundColor: remisionesFiltradas.filter((r) => r.estado !== "Atendida").length > 0 ? "#DC2626" : "#64748B",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.2rem 0.55rem",
                  fontSize: "0.75rem",
                  fontWeight: 700
                }}
              >
                {remisionesFiltradas.filter((r) => r.estado !== "Atendida").length} pendiente(s)
              </span>
            </h3>

            {!fijo && (
              <div style={{ minWidth: "260px", maxWidth: "380px", flex: 1 }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Filtrar bandeja por código, cédula o nombre..."
                    value={filtroBandeja}
                    onChange={(e) => setFiltroBandeja(e.target.value)}
                    style={{ paddingLeft: "32px", paddingRight: "28px", height: "34px", fontSize: "0.85rem" }}
                  />
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                    <i className="fas fa-search"></i>
                  </span>
                  {filtroBandeja && (
                    <button
                      type="button"
                      onClick={() => setFiltroBandeja("")}
                      style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                      title="Limpiar filtro"
                    >
                      <i className="fas fa-xmark"></i>
                    </button>
                  )}
                </div>
              </div>
            )}
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
                {remisionesFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                      {filtroBandeja
                        ? `No se encontraron remisiones para el criterio "${filtroBandeja}".`
                        : "Sin remisiones registradas."}
                    </td>
                  </tr>
                )}
                {remisionesFiltradas.map((r) => (
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
                      <strong style={{ color: "#002855" }}>
                        {r.nombreEstudiante || nombreDeEstudiante(r.codigoEstudiante)}
                      </strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span><i className="fas fa-barcode"></i> Cód: <strong>{r.codigoEstudiante}</strong></span>
                        {r.documentoEstudiante && (
                          <span><i className="fas fa-id-card"></i> Doc: <strong>{r.documentoEstudiante}</strong></span>
                        )}
                      </div>
                      {r.programaEstudiante && (
                        <small className="text-muted" style={{ display: "block", fontSize: "0.725rem", marginTop: "1px" }}>
                          {r.programaEstudiante}
                        </small>
                      )}
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
              <label className="form-label">Recomendaciones para el Aula / Docente Acompañante</label>
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
