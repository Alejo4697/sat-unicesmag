/* ==========================================================================
   Feature: Caracterización
   Instrumento oficial de permanencia estudiantil UNICESMAG (34 ítems).
   Incluye:
     - Panel de administración para el rol Administrador:
       * Visualización y métricas por dimensión (IND, INS, ACA, SOC, GEST PROG).
       * Agregar nueva pregunta.
       * Modificar preguntas existentes (texto, dimensión, tipo de respuesta, orden).
       * Inhabilitar / activar preguntas.
       * Modificar datos generales de la encuesta.
     - Formulario interactivo de diligenciamiento con evaluación multidimensional
       en tiempo real y barra de progreso.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { riskBoxStyle } from "../../shared/utils/risk.js";
import {
  getInstrumento,
  getEstudianteInfo,
  enviarCaracterizacion,
  listEstudiantesParaSelector,
  getEncuestaInfo,
  updateEncuesta,
  listPreguntasAdmin,
  crearPregunta,
  actualizarPregunta,
  togglePregunta,
  eliminarPregunta
} from "./api.js";

const DIMENSIONES_CONFIG = {
  IND: { nombre: "Nivel Individual", label: "Individual (IND)", color: "var(--brand-primary, #1e3a8a)", bg: "rgba(30, 58, 138, 0.08)", icon: "fa-user" },
  INS: { nombre: "Nivel Institucional", label: "Institucional (INS)", color: "#0891b2", bg: "rgba(8, 145, 178, 0.08)", icon: "fa-building-columns" },
  ACA: { nombre: "Nivel Académico", label: "Académico (ACA)", color: "#2563eb", bg: "rgba(37, 99, 235, 0.08)", icon: "fa-graduation-cap" },
  SOC: { nombre: "Nivel Socioeconómico", label: "Socioeconómico (SOC)", color: "#d97706", bg: "rgba(217, 119, 6, 0.08)", icon: "fa-hand-holding-dollar" },
  GEST_PROG: { nombre: "Gestión de Permanencia del Programa", label: "Gestión Prog (GEST PROG)", color: "#059669", bg: "rgba(5, 150, 105, 0.08)", icon: "fa-users-gear" }
};

const FORM_PREGUNTA_VACIO = {
  texto: "",
  categoria: "IND",
  tipoRespuesta: "ESCALA_LIKERT",
  orden: "",
  obligatoria: true,
  activo: true
};

function renderOpciones(item, valor, onChange) {
  const opciones =
    item.tipo === "sino" || item.tipoRespuesta === "BOOLEANO"
      ? [
          { value: 4, label: "Sí", icon: "fa-check" },
          { value: 1, label: "No", icon: "fa-xmark" }
        ]
      : [
          { value: 1, label: "Muy en desacuerdo" },
          { value: 2, label: "En desacuerdo" },
          { value: 3, label: "De acuerdo" },
          { value: 4, label: "Muy de acuerdo" }
        ];

  return opciones.map((op) => (
    <label className="option-pill" key={op.value}>
      <input
        type="radio"
        name={`item_${item.id}`}
        value={op.value}
        checked={valor === op.value}
        onChange={() => onChange(item.id, op.value)}
        required
      />
      <span>
        {op.icon && <i className={`fas ${op.icon}`}></i>} {op.label}
      </span>
    </label>
  ));
}

export default function CaracterizacionPage() {
  const { user } = useAuth();
  const esAdmin = user?.rol === "admin";
  const esEstudiante = user?.rol === "estudiante";

  // Pestaña activa para el administrador
  const [tabAdmin, setTabAdmin] = useState("formulario"); // Por defecto vista de encuesta

  // Estado para el formulario de respuestas
  const [items, setItems] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [codigoEstudiante, setCodigoEstudiante] = useState(
    esEstudiante ? user?.codigoEstudiante || user?.codigo || "202510045" : "202510045"
  );
  const [estudiantePerfil, setEstudiantePerfil] = useState(null);
  const [cargandoEstudiante, setCargandoEstudiante] = useState(false);
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [modalPortafolio, setModalPortafolio] = useState(false);

  // Estado para administración
  const [encuestaInfo, setEncuestaInfo] = useState(null);
  const [preguntasAdmin, setPreguntasAdmin] = useState([]);
  const [filtroDim, setFiltroDim] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");

  // Modales
  const [modalPreguntaAbierto, setModalPreguntaAbierto] = useState(false);
  const [preguntaEditando, setPreguntaEditando] = useState(null);
  const [formPregunta, setFormPregunta] = useState(FORM_PREGUNTA_VACIO);

  const [modalEncuestaAbierto, setModalEncuestaAbierto] = useState(false);
  const [formEncuesta, setFormEncuesta] = useState({ nombre: "", version: 1, vigente_desde: "", vigente_hasta: "" });

  const [notificacion, setNotificacion] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function avisar(mensaje, tipo = "exito") {
    setNotificacion({ mensaje, tipo });
    setTimeout(() => setNotificacion(null), 4500);
  }

  // Cargar datos del estudiante seleccionado / activo
  useEffect(() => {
    if (!codigoEstudiante) {
      setEstudiantePerfil(null);
      return;
    }
    setCargandoEstudiante(true);
    getEstudianteInfo(codigoEstudiante)
      .then((info) => {
        setEstudiantePerfil(info);
      })
      .catch((err) => {
        console.warn("No se pudo cargar el perfil detallado del estudiante:", err.message);
      })
      .finally(() => setCargandoEstudiante(false));
  }, [codigoEstudiante]);

  // Cargar datos generales
  const cargarDatos = () => {
    const pedidos = [getInstrumento()];
    if (!esEstudiante) pedidos.push(listEstudiantesParaSelector());
    if (esAdmin) {
      pedidos.push(getEncuestaInfo());
      pedidos.push(listPreguntasAdmin());
    }

    Promise.all(pedidos)
      .then(([instrumento, listaEstudiantes, infoEncuesta, preguntas]) => {
        setItems(instrumento);
        if (listaEstudiantes) setEstudiantes(listaEstudiantes);
        if (infoEncuesta) {
          setEncuestaInfo(infoEncuesta);
          setFormEncuesta({
            nombre: infoEncuesta.nombre || "Formulario caracterización permanencia",
            version: infoEncuesta.version || 1,
            vigente_desde: infoEncuesta.vigente_desde ? infoEncuesta.vigente_desde.substring(0, 10) : "",
            vigente_hasta: infoEncuesta.vigente_hasta ? infoEncuesta.vigente_hasta.substring(0, 10) : ""
          });
        }
        if (preguntas) setPreguntasAdmin(preguntas);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    cargarDatos();
  }, [esAdmin, esEstudiante]);

  // Manejo de respuestas del formulario
  const total = items.length;
  const respondidos = Object.keys(respuestas).length;
  const porcentaje = total ? Math.round((respondidos / total) * 100) : 0;

  const grupos = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const dim = item.dim || "IND";
      if (!map.has(dim)) {
        map.set(dim, { dim, dimNombre: item.dimNombre || DIMENSIONES_CONFIG[dim]?.nombre || dim, items: [] });
      }
      map.get(dim).items.push(item);
    });
    return Array.from(map.values());
  }, [items]);

  function responder(itemId, valor) {
    setRespuestas((prev) => ({ ...prev, [`item_${itemId}`]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!codigoEstudiante) {
      setError("Seleccione el estudiante que diligencia el instrumento.");
      return;
    }
    if (respondidos < total) {
      setError(`Por favor complete todos los ${total} ítems del instrumento (${respondidos}/${total}).`);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const envio = await enviarCaracterizacion({ codigoEstudiante, respuestas });
      setResultado(envio);
      avisar("Encuesta de caracterización enviada y evaluada correctamente.");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  // --- ACCIONES DE ADMINISTRACIÓN ---

  function abrirModalNuevaPregunta() {
    setPreguntaEditando(null);
    setFormPregunta({
      ...FORM_PREGUNTA_VACIO,
      orden: preguntasAdmin.length + 1
    });
    setModalPreguntaAbierto(true);
  }

  function abrirModalEditarPregunta(preg) {
    setPreguntaEditando(preg);
    setFormPregunta({
      texto: preg.texto,
      categoria: preg.categoria === "GEST PROG" ? "GEST_PROG" : preg.categoria,
      tipoRespuesta: preg.tipoRespuesta || "ESCALA_LIKERT",
      orden: preg.orden,
      obligatoria: preg.obligatoria ?? true,
      activo: preg.activo ?? true
    });
    setModalPreguntaAbierto(true);
  }

  async function handleGuardarPregunta(e) {
    e.preventDefault();
    if (!formPregunta.texto.trim()) {
      setError("El texto de la pregunta es obligatorio.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      if (preguntaEditando) {
        await actualizarPregunta(preguntaEditando.id, formPregunta);
        avisar(`Pregunta #${formPregunta.orden} actualizada con éxito.`);
      } else {
        await crearPregunta(formPregunta);
        avisar("Nueva pregunta agregada a la encuesta de caracterización.");
      }
      setModalPreguntaAbierto(false);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleTogglePregunta(id, activoActual) {
    try {
      await togglePregunta(id);
      avisar(`Pregunta ${activoActual ? "inhabilitada" : "activada"} correctamente.`);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEliminarPregunta(id, orden) {
    if (!window.confirm(`¿Está seguro de eliminar o inhabilitar la pregunta #${orden}?`)) {
      return;
    }
    try {
      const res = await eliminarPregunta(id);
      avisar(res.message || "Pregunta procesada correctamente.");
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGuardarEncuesta(e) {
    e.preventDefault();
    if (!encuestaInfo?.id) return;
    setGuardando(true);
    setError("");
    try {
      await updateEncuesta(encuestaInfo.id, formEncuesta);
      avisar("Metadatos de la encuesta actualizados correctamente.");
      setModalEncuestaAbierto(false);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  // Filtrado de preguntas para la tabla administrativa
  const preguntasFiltradas = useMemo(() => {
    return preguntasAdmin.filter((p) => {
      const dimNorm = (p.categoria === "GEST PROG" ? "GEST_PROG" : p.categoria) || "IND";
      if (filtroDim !== "TODAS" && dimNorm !== filtroDim) return false;
      if (filtroEstado === "ACTIVAS" && !p.activo) return false;
      if (filtroEstado === "INACTIVAS" && p.activo) return false;
      if (busqueda.trim()) {
        const term = busqueda.toLowerCase();
        const coincideTexto = p.texto.toLowerCase().includes(term);
        const coincideNum = String(p.orden).includes(term);
        if (!coincideTexto && !coincideNum) return false;
      }
      return true;
    });
  }, [preguntasAdmin, filtroDim, filtroEstado, busqueda]);

  return (
    <AppLayout
      titulo="Formulario Caracterización Permanencia"
      breadcrumb="Instrumento Institucional / Detección Temprana de Factores de Riesgo"
    >
      {/* Notificaciones flotantes */}
      {notificacion && (
        <div
          className="alert"
          style={{
            marginBottom: "1.25rem",
            background: notificacion.tipo === "exito" ? "#ECFDF5" : "#FEF2F2",
            borderColor: notificacion.tipo === "exito" ? "#10B981" : "#EF4444",
            color: notificacion.tipo === "exito" ? "#065F46" : "#991B1B",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.85rem 1.25rem",
            borderRadius: "var(--radius-md)"
          }}
        >
          <i className={`fas ${notificacion.tipo === "exito" ? "fa-circle-check" : "fa-triangle-exclamation"}`}></i>
          <span>{notificacion.mensaje}</span>
        </div>
      )}

      {error && (
        <div
          className="alert alert-danger"
          style={{
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.85rem 1.25rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <i className="fas fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Selector de modo para Administrador */}
      {esAdmin && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            background: "var(--surface-card)",
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-xs)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              <i className="fas fa-shield-halved" style={{ color: "var(--brand-primary)", marginRight: "0.35rem" }}></i>
              Modo Administrador:
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={`btn btn-sm ${tabAdmin === "gestion" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setTabAdmin("gestion")}
                style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 600 }}
              >
                <i className="fas fa-sliders"></i>
                Gestión y Edición de la Encuesta ({preguntasAdmin.length || 34})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tabAdmin === "formulario" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setTabAdmin("formulario")}
                style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 600 }}
              >
                <i className="fas fa-eye"></i>
                Vista Previa / Diligenciamiento
              </button>
            </div>
          </div>

          {tabAdmin === "gestion" && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setModalEncuestaAbierto(true)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <i className="fas fa-pen-to-square"></i>
                Editar Encuesta
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={abrirModalNuevaPregunta}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <i className="fas fa-plus"></i>
                Nueva Pregunta
              </button>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* VISTA 1: PANEL DE GESTIÓN Y EDICIÓN DE LA ENCUESTA (SOLO ADMIN)             */}
      {/* -------------------------------------------------------------------------- */}
      {esAdmin && tabAdmin === "gestion" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Tarjeta de Encabezado Institucional del Instrumento */}
          <div
            className="card"
            style={{
              padding: "1.5rem",
              background: "linear-gradient(135deg, #FFFFFF 0%, var(--surface-subtle) 100%)",
              border: "1px solid var(--border-light)",
              borderLeft: "5px solid var(--brand-primary)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.4rem" }}>
                  <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
                    {encuestaInfo?.nombre || "Formulario caracterización permanencia"}
                  </h2>
                  <span className="badge badge-primary" style={{ fontSize: "0.75rem" }}>
                    Versión {encuestaInfo?.version || 1}
                  </span>
                  <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>
                    {encuestaInfo?.activo ? "Activa / Vigente" : "Inactiva"}
                  </span>
                </div>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "800px" }}>
                  Instrumento psicométrico e institucional aplicado a estudiantes de <strong>1°, 4° y 7° semestre</strong> para evaluar las 5 dimensiones clave de permanencia estudiantil. Los cambios realizados se aplican inmediatamente al formulario del estudiante.
                </p>
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>
                  Total Ítems: <strong>{preguntasAdmin.length}</strong> (Activos: <strong>{encuestaInfo?.totalActivas || items.length}</strong>)
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginTop: "0.2rem" }}>
                  Vigencia: {encuestaInfo?.vigente_desde ? new Date(encuestaInfo.vigente_desde).toLocaleDateString() : "Indefinida"}
                </span>
              </div>
            </div>
          </div>

          {/* Tarjetas KPI de Dimensiones */}
          <div className="dashboard-grid" style={{ marginBottom: 0 }}>
            {Object.entries(DIMENSIONES_CONFIG).map(([key, cfg]) => {
              const conteo = encuestaInfo?.conteoPorDimension?.[key] ?? preguntasAdmin.filter((p) => (p.categoria === "GEST PROG" ? "GEST_PROG" : p.categoria) === key).length;
              const activo = filtroDim === key;
              return (
                <div
                  key={key}
                  className="kpi-card"
                  style={{
                    gridColumn: "span 2",
                    cursor: "pointer",
                    border: activo ? `2px solid ${cfg.color}` : "1px solid var(--border-light)",
                    background: activo ? cfg.bg : "var(--surface-card)"
                  }}
                  onClick={() => setFiltroDim(activo ? "TODAS" : key)}
                  title={`Filtrar por ${cfg.nombre}`}
                >
                  <div className="kpi-body">
                    <span className="kpi-label">{cfg.label}</span>
                    <span className="kpi-value" style={{ color: cfg.color }}>{conteo} ítems</span>
                  </div>
                  <div className="kpi-icon" style={{ background: cfg.bg, color: cfg.color }}>
                    <i className={`fas ${cfg.icon}`}></i>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              background: "var(--surface-card)",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: "260px" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <i
                  className="fas fa-search"
                  style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                ></i>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Buscar ítem por texto o número..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{ paddingLeft: "36px" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <select
                className="form-control"
                value={filtroDim}
                onChange={(e) => setFiltroDim(e.target.value)}
                style={{ minWidth: "190px" }}
              >
                <option value="TODAS">Todas las Dimensiones</option>
                {Object.entries(DIMENSIONES_CONFIG).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                className="form-control"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                style={{ minWidth: "130px" }}
              >
                <option value="TODAS">Todos los estados</option>
                <option value="ACTIVAS">Solo Activas</option>
                <option value="INACTIVAS">Solo Inactivas</option>
              </select>

              {(filtroDim !== "TODAS" || filtroEstado !== "TODAS" || busqueda) && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    setFiltroDim("TODAS");
                    setFiltroEstado("TODAS");
                    setBusqueda("");
                  }}
                  title="Restablecer filtros"
                >
                  <i className="fas fa-rotate-left"></i>
                </button>
              )}
            </div>
          </div>

          {/* Tabla de Preguntas Administrables */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border-light)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                Listado de Preguntas del Instrumento ({preguntasFiltradas.length} mostradas)
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Organizado según documento oficial de permanencia UNICESMAG
              </span>
            </div>

            <div className="table-responsive">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: "50px", textAlign: "center" }}>#</th>
                    <th style={{ width: "160px" }}>Dimensión</th>
                    <th>Texto del Ítem / Pregunta</th>
                    <th style={{ width: "180px" }}>Tipo de Respuesta</th>
                    <th style={{ width: "100px", textAlign: "center" }}>Estado</th>
                    <th style={{ width: "150px", textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {preguntasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-muted)" }}>
                        <i className="fas fa-circle-question" style={{ fontSize: "2rem", marginBottom: "0.5rem", display: "block" }}></i>
                        No se encontraron preguntas con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    preguntasFiltradas.map((preg) => {
                      const dimKey = (preg.categoria === "GEST PROG" ? "GEST_PROG" : preg.categoria) || "IND";
                      const cfg = DIMENSIONES_CONFIG[dimKey] || DIMENSIONES_CONFIG.IND;
                      return (
                        <tr key={preg.id} style={{ opacity: preg.activo ? 1 : 0.6 }}>
                          <td style={{ textAlign: "center", fontWeight: 700, color: "var(--text-muted)" }}>
                            {preg.orden}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.25rem 0.6rem",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: cfg.bg,
                                color: cfg.color
                              }}
                            >
                              <i className={`fas ${cfg.icon}`}></i> {dimKey.replace("_", " ")}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.925rem", fontWeight: 500 }}>
                            {preg.texto}
                            {!preg.obligatoria && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                (Opcional)
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-main)" }}>
                              {preg.tipoRespuesta === "BOOLEANO" || preg.tipo === "sino" ? (
                                <><i className="fas fa-toggle-on" style={{ color: "var(--brand-primary)", marginRight: "0.3rem" }}></i> Sí / No</>
                              ) : preg.tipoRespuesta === "LIKERT_INVERSO" || preg.tipo === "likert_inverso" ? (
                                <><i className="fas fa-arrows-rotate" style={{ color: "#d97706", marginRight: "0.3rem" }}></i> Likert (Inversa)</>
                              ) : (
                                <><i className="fas fa-bars-staggered" style={{ color: "#0891b2", marginRight: "0.3rem" }}></i> Likert (4 puntos)</>
                              )}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span
                              className={`badge ${preg.activo ? "badge-success" : "badge-secondary"}`}
                              style={{ fontSize: "0.75rem" }}
                            >
                              {preg.activo ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => abrirModalEditarPregunta(preg)}
                                title="Modificar pregunta"
                                style={{ padding: "0.3rem 0.55rem" }}
                              >
                                <i className="fas fa-pen-to-square"></i>
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm ${preg.activo ? "btn-outline" : "btn-outline-success"}`}
                                onClick={() => handleTogglePregunta(preg.id, preg.activo)}
                                title={preg.activo ? "Inhabilitar pregunta" : "Activar pregunta"}
                                style={{ padding: "0.3rem 0.55rem" }}
                              >
                                <i className={`fas ${preg.activo ? "fa-eye-slash" : "fa-eye"}`}></i>
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => handleEliminarPregunta(preg.id, preg.orden)}
                                title="Eliminar pregunta"
                                style={{ padding: "0.3rem 0.55rem", color: "#DC2626" }}
                              >
                                <i className="fas fa-trash-can"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* -------------------------------------------------------------------------- */
        /* VISTA 2: FORMULARIO INTERACTIVO DE DILIGENCIAMIENTO                         */
        /* -------------------------------------------------------------------------- */
        <div>
          {/* Banner de progreso */}
          <div
            className="card"
            style={{
              background: "linear-gradient(135deg, #FFFFFF 0%, var(--surface-subtle) 100%)",
              border: "1px solid var(--border-light)",
              marginBottom: "1.5rem",
              padding: "1.5rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "var(--brand-primary-50)",
                    color: "var(--brand-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.25rem"
                  }}
                >
                  <i className="fas fa-list-check"></i>
                </div>
                <div>
                  <h2 style={{ fontSize: "1.15rem", margin: 0, fontWeight: 700 }}>
                    {encuestaInfo?.nombre || "Formulario de Caracterización y Permanencia"}
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    {total} ítems oficiales en 5 dimensiones — Semestres 1, 4 y 7
                  </p>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "1.25rem", fontWeight: 700, color: porcentaje === 100 ? "#059669" : "var(--brand-primary)" }}>
                  {porcentaje}%
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>
                  {respondidos} de {total} completados
                </span>
              </div>
            </div>

            <div style={{ width: "100%", height: "8px", background: "var(--border-light)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  width: `${porcentaje}%`,
                  height: "100%",
                  background: porcentaje === 100 ? "#059669" : "var(--brand-primary)",
                  transition: "width 0.3s ease"
                }}
              ></div>
            </div>
          </div>

          {/* Selector de estudiante para roles asistenciales / directivos / admin */}
          {!esEstudiante && (
            <div className="card" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
              <label className="form-label" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <i className="fas fa-user-graduate" style={{ color: "var(--brand-primary)" }}></i>
                Seleccionar Estudiante a Caracterizar:
              </label>
              <select
                className="form-control"
                value={codigoEstudiante}
                onChange={(e) => setCodigoEstudiante(e.target.value)}
                style={{ maxWidth: "500px" }}
              >
                <option value="">-- Seleccione un estudiante --</option>
                {estudiantes.map((est) => (
                  <option key={est.codigo} value={est.codigo}>
                    {est.codigo} — {est.nombres} {est.apellidos} ({est.programa}, Semestre {est.semestre})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Formulario de preguntas agrupadas */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {grupos.map((grupo) => {
                const cfg = DIMENSIONES_CONFIG[grupo.dim] || DIMENSIONES_CONFIG.IND;
                return (
                  <div key={grupo.dim} className="card" style={{ padding: "1.5rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        paddingBottom: "1rem",
                        marginBottom: "1.25rem",
                        borderBottom: "2px solid var(--surface-subtle)"
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius-sm)",
                          background: cfg.bg,
                          color: cfg.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <i className={`fas ${cfg.icon}`}></i>
                      </div>
                      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>
                        {grupo.dimNombre}
                      </h3>
                      <span className="badge" style={{ background: cfg.bg, color: cfg.color, marginLeft: "auto", fontSize: "0.75rem" }}>
                        {grupo.items.length} ítems
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                      {grupo.items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            padding: "1rem",
                            borderRadius: "var(--radius-md)",
                            background: respuestas[`item_${item.id}`] ? "var(--surface-subtle)" : "transparent",
                            border: "1px solid var(--border-light)"
                          }}
                        >
                          <p style={{ margin: "0 0 0.75rem 0", fontWeight: 600, fontSize: "0.95rem" }}>
                            <span style={{ color: "var(--brand-primary)", marginRight: "0.4rem" }}>#{item.id}.</span>
                            {item.texto}
                          </p>

                          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                            {renderOpciones(item, respuestas[`item_${item.id}`], responder)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botón de Enviar */}
            <div style={{ marginTop: "1.75rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={enviando || respondidos < total}
                style={{ minWidth: "220px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
              >
                {enviando ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Evaluando...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i> Enviar y Evaluar Riesgo
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Resultado de la evaluación */}
          {resultado && (
            <div className="card" style={{ marginTop: "2rem", padding: "1.5rem", borderLeft: `5px solid ${resultado.riesgoGlobal === "Alto" ? "#DC2626" : resultado.riesgoGlobal === "Medio" ? "#D97706" : "#059669"}` }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.25rem", fontWeight: 700 }}>
                Resultado de la Evaluación Psicopedagógica
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", background: "var(--surface-subtle)" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>Riesgo Global</span>
                  <span
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      color: resultado.riesgoGlobal === "Alto" ? "#DC2626" : resultado.riesgoGlobal === "Medio" ? "#D97706" : "#059669"
                    }}
                  >
                    {resultado.riesgoGlobal} ({resultado.promedioGlobal} / 4.0)
                  </span>
                </div>

                {Object.entries(resultado.porDimension).map(([dim, data]) => {
                  const cfg = DIMENSIONES_CONFIG[dim] || DIMENSIONES_CONFIG.IND;
                  return (
                    <div key={dim} style={{ padding: "1rem", borderRadius: "var(--radius-md)", background: "var(--surface-subtle)" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block" }}>{cfg.label}</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                        {data.riesgo} ({data.promedio})
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <Link to="/ficha-estudiante" className="btn btn-primary btn-sm">
                  <i className="fas fa-address-card" style={{ marginRight: "0.35rem" }}></i>
                  Ver Ficha 360° del Estudiante
                </Link>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setResultado(null);
                    setRespuestas({});
                  }}
                >
                  Nuevo Diligenciamiento
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: AGREGAR / EDITAR PREGUNTA                                            */}
      {/* -------------------------------------------------------------------------- */}
      {modalPreguntaAbierto && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "600px",
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: "1.75rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                {preguntaEditando ? `Modificar Ítem #${preguntaEditando.orden}` : "Agregar Nueva Pregunta al Instrumento"}
              </h3>
              <button
                type="button"
                onClick={() => setModalPreguntaAbierto(false)}
                style={{ background: "none", border: "none", fontSize: "1.1rem", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleGuardarPregunta}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Texto del Ítem / Pregunta *
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ej. Me siento motivado a participar en actividades de mi universidad."
                    value={formPregunta.texto}
                    onChange={(e) => setFormPregunta({ ...formPregunta, texto: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Dimensión / Categoría *
                    </label>
                    <select
                      className="form-control"
                      value={formPregunta.categoria}
                      onChange={(e) => setFormPregunta({ ...formPregunta, categoria: e.target.value })}
                      required
                    >
                      {Object.entries(DIMENSIONES_CONFIG).map(([k, c]) => (
                        <option key={k} value={k}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Tipo de Respuesta *
                    </label>
                    <select
                      className="form-control"
                      value={formPregunta.tipoRespuesta}
                      onChange={(e) => setFormPregunta({ ...formPregunta, tipoRespuesta: e.target.value })}
                      required
                    >
                      <option value="ESCALA_LIKERT">Escala Likert (4 puntos)</option>
                      <option value="BOOLEANO">Sí / No (Booleano)</option>
                      <option value="LIKERT_INVERSO">Escala Likert Inversa (Mayor puntaje = Más riesgo)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      N° de Orden
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      value={formPregunta.orden}
                      onChange={(e) => setFormPregunta({ ...formPregunta, orden: e.target.value })}
                      placeholder="Posición en la encuesta"
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.5rem", paddingTop: "1.2rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                      <input
                        type="checkbox"
                        checked={formPregunta.obligatoria}
                        onChange={(e) => setFormPregunta({ ...formPregunta, obligatoria: e.target.checked })}
                      />
                      <span>Obligatoria</span>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                      <input
                        type="checkbox"
                        checked={formPregunta.activo}
                        onChange={(e) => setFormPregunta({ ...formPregunta, activo: e.target.checked })}
                      />
                      <span>Pregunta Activa</span>
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalPreguntaAbierto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={guardando}
                  style={{ minWidth: "140px" }}
                >
                  {guardando ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-floppy-disk"></i> {preguntaEditando ? "Actualizar" : "Crear Ítem"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: EDITAR DATOS GENERALES DE LA ENCUESTA                                */}
      {/* -------------------------------------------------------------------------- */}
      {modalEncuestaAbierto && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: "1.75rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                Editar Configuración de la Encuesta
              </h3>
              <button
                type="button"
                onClick={() => setModalEncuestaAbierto(false)}
                style={{ background: "none", border: "none", fontSize: "1.1rem", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleGuardarEncuesta}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Nombre del Instrumento *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formEncuesta.nombre}
                    onChange={(e) => setFormEncuesta({ ...formEncuesta, nombre: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Versión
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min={1}
                      value={formEncuesta.version}
                      onChange={(e) => setFormEncuesta({ ...formEncuesta, version: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Vigente Desde
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={formEncuesta.vigente_desde}
                      onChange={(e) => setFormEncuesta({ ...formEncuesta, vigente_desde: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setModalEncuestaAbierto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={guardando}
                  style={{ minWidth: "140px" }}
                >
                  {guardando ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Guardando...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-floppy-disk"></i> Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
