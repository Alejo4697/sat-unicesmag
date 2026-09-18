/* ==========================================================================
   Feature: Seguimiento Estudiantil
   Ficha 360° del Estudiante con:
     - Métricas académicas (Promedio, Inasistencias).
     - Semaforización por Dimensiones del Instrumento de Caracterización
       (Individual, Institucional, Académico, Socioeconómico, Gestión Programa).
     - Botón y modal de consulta interactiva de respuestas por sesión/dimensión.
     - Historial de intervenciones y remisiones con secreto profesional (RNF01).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import IntervencionesPanel from "../../shared/panels/IntervencionesPanel.jsx";
import RemisionesPanel from "../../shared/panels/RemisionesPanel.jsx";
import { riskBadgeClass, riskBoxStyle } from "../../shared/utils/risk.js";
import { listEstudiantes, getEstudiante, getCaracterizacionesEstudiante } from "./api.js";

const DIMENSIONES_INFO = {
  IND: { nombre: "Nivel Individual", label: "Individual (IND)", color: "var(--brand-primary, #1e3a8a)", bg: "rgba(30, 58, 138, 0.08)", icon: "fa-user" },
  INS: { nombre: "Nivel Institucional", label: "Institucional (INS)", color: "#0891b2", bg: "rgba(8, 145, 178, 0.08)", icon: "fa-building-columns" },
  ACA: { nombre: "Nivel Académico", label: "Académico (ACA)", color: "#2563eb", bg: "rgba(37, 99, 235, 0.08)", icon: "fa-graduation-cap" },
  SOC: { nombre: "Nivel Socioeconómico", label: "Socioeconómico (SOC)", color: "#d97706", bg: "rgba(217, 119, 6, 0.08)", icon: "fa-hand-holding-dollar" },
  GEST_PROG: { nombre: "Gestión de Permanencia del Programa", label: "Gestión Prog (GEST PROG)", color: "#059669", bg: "rgba(5, 150, 105, 0.08)", icon: "fa-users-gear" }
};

const TABS = [
  { id: "resumen", label: "Resumen", icon: "fa-id-card" },
  { id: "intervenciones", label: "Intervenciones", icon: "fa-clipboard-check" },
  { id: "remisiones", label: "Remisiones", icon: "fa-share-nodes" }
];

export default function FichaEstudiantePage() {
  const { puedeAcceder } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [termino, setTermino] = useState(searchParams.get("codigo") || "220109009");
  const [estudiante, setEstudiante] = useState(null);
  const [caracterizaciones, setCaracterizaciones] = useState([]);
  const [sesionActivaIdx, setSesionActivaIdx] = useState(0);

  // Modal de Detalle de Respuestas
  const [modalRespuestasAbierto, setModalRespuestasAbierto] = useState(false);
  const [filtroDimModal, setFiltroDimModal] = useState("TODAS");
  const [busquedaPregunta, setBusquedaPregunta] = useState("");

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState("resumen");

  const puedeIntervenciones = puedeAcceder("intervenciones");
  const puedeRemisiones = puedeAcceder("remisiones");
  const tabActiva =
    (tab === "intervenciones" && !puedeIntervenciones) || (tab === "remisiones" && !puedeRemisiones) ? "resumen" : tab;

  async function cargarPorCodigo(codigo) {
    setCargando(true);
    setError("");
    try {
      const [est, carList] = await Promise.all([
        getEstudiante(codigo),
        getCaracterizacionesEstudiante(codigo).catch(() => [])
      ]);
      setEstudiante(est);
      setCaracterizaciones(carList || []);
      setSesionActivaIdx(0);
    } catch (err) {
      setError(err.message);
      setEstudiante(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const codigo = searchParams.get("codigo") || "220109009";
    setTermino(codigo);
    cargarPorCodigo(codigo);
  }, [searchParams]);

  async function buscar(e) {
    e.preventDefault();
    const q = termino.trim();
    if (!q) return;
    setError("");
    setCargando(true);
    try {
      // 1. Intentar resolver directamente por código o cédula exacta
      try {
        const estDirecto = await getEstudiante(q);
        if (estDirecto && estDirecto.codigo) {
          setSearchParams({ codigo: estDirecto.codigo });
          cargarPorCodigo(estDirecto.codigo);
          return;
        }
      } catch {
        // Continuar con búsqueda por coincidencia
      }

      // 2. Búsqueda por lista y coincidencias parciales
      const resultados = await listEstudiantes(q);
      if (resultados.length === 0) {
        setError("No se encontraron estudiantes con ese código, cédula o nombre.");
        return;
      }
      const exacto = resultados.find(
        (r) =>
          r.codigo.toLowerCase() === q.toLowerCase() ||
          (r.documento && r.documento.toLowerCase() === q.toLowerCase())
      );
      const codigoEncontrado = (exacto || resultados[0]).codigo;
      setSearchParams({ codigo: codigoEncontrado });
      cargarPorCodigo(codigoEncontrado);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  // Sesión de caracterización actualmente seleccionada para visualizar
  const sesionActiva = caracterizaciones[sesionActivaIdx] || null;

  // Respuestas filtradas dentro del modal
  const respuestasFiltradas = useMemo(() => {
    if (!sesionActiva?.detalles) return [];
    return sesionActiva.detalles.filter((d) => {
      const dimKey = (d.dim === "GEST PROG" ? "GEST_PROG" : d.dim) || "IND";
      if (filtroDimModal !== "TODAS" && dimKey !== filtroDimModal) return false;
      if (busquedaPregunta.trim()) {
        const term = busquedaPregunta.toLowerCase();
        const matchTexto = d.texto.toLowerCase().includes(term);
        const matchNum = String(d.orden).includes(term);
        const matchOpcion = (d.opcionTexto || "").toLowerCase().includes(term);
        if (!matchTexto && !matchNum && !matchOpcion) return false;
      }
      return true;
    });
  }, [sesionActiva, filtroDimModal, busquedaPregunta]);

  // Mapa de semaforización de 5 dimensiones
  const semaforizacion5D = useMemo(() => {
    if (sesionActiva?.porDimension) {
      return {
        IND: sesionActiva.porDimension.IND?.riesgo || "Medio",
        INS: sesionActiva.porDimension.INS?.riesgo || "Bajo",
        ACA: sesionActiva.porDimension.ACA?.riesgo || "Medio",
        SOC: sesionActiva.porDimension.SOC?.riesgo || "Medio",
        GEST_PROG: sesionActiva.porDimension.GEST_PROG?.riesgo || "Medio"
      };
    }
    if (estudiante?.puntajesCampo) {
      return {
        IND: estudiante.puntajesCampo.individual || "Medio",
        INS: estudiante.puntajesCampo.asistencial || "Bajo",
        ACA: estudiante.puntajesCampo.academico || "Medio",
        SOC: estudiante.puntajesCampo.socioeconomico || "Medio",
        GEST_PROG: estudiante.puntajesCampo.gestionPrograma || "Medio"
      };
    }
    return { IND: "Medio", INS: "Bajo", ACA: "Medio", SOC: "Medio", GEST_PROG: "Medio" };
  }, [sesionActiva, estudiante]);

  return (
    <AppLayout titulo="Ficha 360° del Estudiante" breadcrumb="Consulta Integral / Confidencialidad RNF01">
      {/* Buscador de estudiantes */}
      <div className="card" style={{ padding: "1rem 1.25rem" }}>
        <form onSubmit={buscar} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por código institucional, cédula o nombre..."
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            <i className="fas fa-magnifying-glass"></i> Buscar Estudiante
          </button>
        </form>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
          Sugerencias en Base de Datos: <code>220109009</code> (Santiago Villota - Cédula: <code>1085001009</code>),{" "}
          <code>220109988</code> (Carlos Gómez - Cédula: <code>1085999888</code>), <code>220109010</code> (Estudiante de Prueba - Cédula: <code>1085002000</code>),{" "}
          <code>220109001</code> (Alejandro Muñoz - Pendiente)
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {estudiante && !cargando && (
        <>
          {/* Header del Estudiante */}
          <div className="student-header-card">
            <div
              className="student-avatar"
              style={{
                background: "var(--brand-primary-50)",
                border: "2px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2.25rem",
                color: "var(--brand-primary)"
              }}
            >
              <i className="fas fa-user-graduate"></i>
            </div>
            <div className="student-meta">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 className="student-name">
                    {estudiante.nombres} {estudiante.apellidos}
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    Código: {estudiante.codigo} | Doc: {estudiante.documento}
                  </span>
                </div>
                <div>
                  <span className={`badge ${riskBadgeClass(sesionActiva?.riesgoGlobal || estudiante.riesgoGlobal)}`}>
                    <i className="fas fa-circle-exclamation"></i> Riesgo Global {sesionActiva?.riesgoGlobal || estudiante.riesgoGlobal}
                  </span>
                </div>
              </div>

              <div className="student-tags">
                <span className="tag-item">
                  <i className="fas fa-graduation-cap"></i> {estudiante.programa}
                </span>
                <span className="tag-item">
                  <i className="fas fa-calendar"></i> Semestre {estudiante.semestre} ({estudiante.periodo})
                </span>
                <span className="tag-item">
                  <i className="fas fa-envelope"></i> {estudiante.email}
                </span>
                <span className="tag-item">
                  <i className="fas fa-phone"></i> {estudiante.telefono}
                </span>
                {estudiante.acudiente && (
                  <span className="tag-item">
                    <i className="fas fa-user-group"></i> Acudiente: {estudiante.acudiente.nombre} ({estudiante.acudiente.parentesco}) -{" "}
                    {estudiante.acudiente.telefono}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Navegación por pestañas */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)" }}>
              {TABS.map((t) => {
                const habilitada =
                  t.id === "resumen" || (t.id === "intervenciones" ? puedeIntervenciones : puedeRemisiones);
                const activa = tabActiva === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!habilitada}
                    title={habilitada ? undefined : "Tu rol no tiene acceso a este módulo"}
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: "0.75rem 1.1rem",
                      border: "none",
                      background: "transparent",
                      borderBottom: `2px solid ${activa ? "var(--brand-primary)" : "transparent"}`,
                      color: !habilitada ? "var(--text-muted)" : activa ? "var(--brand-primary)" : "var(--text-main)",
                      fontWeight: activa ? 700 : 500,
                      fontSize: "0.85rem",
                      opacity: habilitada ? 1 : 0.5,
                      cursor: habilitada ? "pointer" : "not-allowed"
                    }}
                  >
                    <i className={`fas ${t.icon}`}></i> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tabActiva === "intervenciones" && (
            <IntervencionesPanel
              key={estudiante.codigo}
              codigoEstudiante={estudiante.codigo}
              nombreEstudiante={`${estudiante.nombres} ${estudiante.apellidos}`}
            />
          )}

          {tabActiva === "remisiones" && (
            <RemisionesPanel
              key={estudiante.codigo}
              codigoEstudiante={estudiante.codigo}
              nombreEstudiante={`${estudiante.nombres} ${estudiante.apellidos}`}
            />
          )}

          {tabActiva === "resumen" && (
            <>
              <div className="dashboard-grid">
                {/* Tarjeta de Métricas Académicas */}
                <div className="card" style={{ gridColumn: "span 4" }}>
                  <div className="card-header">
                    <h3 className="card-title">Métricas Académicas</h3>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", padding: "0.5rem 0" }}>
                    <div>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--brand-accent)" }}>
                        {estudiante.promedioAcademico.toFixed(1)}
                      </span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>Promedio Ponderado</p>
                    </div>
                    <div style={{ borderLeft: "1px solid var(--border-light)", paddingLeft: "1.5rem" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--risk-high-text)" }}>
                        {estudiante.inasistenciasAcumuladas} Horas
                      </span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>Inasistencias</p>
                    </div>
                  </div>
                </div>

                {/* Tarjeta de Semaforización por Dimensiones y Encuesta */}
                <div className="card" style={{ gridColumn: "span 8" }}>
                  <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <h3 className="card-title" style={{ margin: 0 }}>
                        Semaforización por Encuesta de Caracterización
                      </h3>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {caracterizaciones.length > 0
                          ? `Sesión registrada: ${sesionActiva?.fecha || "2025 II"} (${sesionActiva?.promedioGlobal ? `Promedio: ${sesionActiva.promedioGlobal}/4.0` : ""})`
                          : "Encuesta institucional de permanencia (34 ítems)"}
                      </span>
                    </div>

                    {/* Botones de Acción / Sesiones */}
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      {caracterizaciones.length > 1 && (
                        <div style={{ display: "flex", gap: "0.25rem", marginRight: "0.4rem" }}>
                          {caracterizaciones.map((s, idx) => (
                            <button
                              key={s.id || idx}
                              type="button"
                              className={`btn btn-sm ${sesionActivaIdx === idx ? "btn-primary" : "btn-outline"}`}
                              onClick={() => setSesionActivaIdx(idx)}
                              title={`Ver sesión del ${s.fecha}`}
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                            >
                              Sesión #{idx + 1}
                            </button>
                          ))}
                        </div>
                      )}

                      {caracterizaciones.length > 0 ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setFiltroDimModal("TODAS");
                            setBusquedaPregunta("");
                            setModalRespuestasAbierto(true);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}
                        >
                          <i className="fas fa-list-check"></i>
                          <span>Ver Respuestas de la Encuesta</span>
                          <span
                            style={{
                              background: "rgba(255,255,255,0.25)",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "10px",
                              fontSize: "0.7rem"
                            }}
                          >
                            {sesionActiva?.detalles?.length || 34}
                          </span>
                        </button>
                      ) : (
                        <Link
                          to={`/caracterizacion`}
                          className="btn btn-sm btn-outline"
                          style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <i className="fas fa-file-pen"></i>
                          <span>Diligenciar Caracterización</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Bloques de Semaforización en las 5 Dimensiones */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, textAlign: "center", marginTop: "0.75rem" }}>
                    {Object.entries(DIMENSIONES_INFO).map(([key, info]) => {
                      const nivel = semaforizacion5D[key] || "Medio";
                      return (
                        <div
                          key={key}
                          style={{
                            ...riskBoxStyle(nivel),
                            padding: "0.75rem 0.4rem",
                            borderRadius: "var(--radius-sm)",
                            cursor: caracterizaciones.length > 0 ? "pointer" : "default",
                            transition: "transform 0.15s ease"
                          }}
                          onClick={() => {
                            if (caracterizaciones.length > 0) {
                              setFiltroDimModal(key);
                              setModalRespuestasAbierto(true);
                            }
                          }}
                          title={`Click para ver respuestas de ${info.nombre}`}
                        >
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, display: "block" }}>
                            {info.label}
                          </span>
                          <p style={{ fontWeight: 700, margin: "4px 0 0", fontSize: "0.85rem" }}>
                            {nivel} {nivel === "Alto" ? "🔴" : nivel === "Medio" ? "🟠" : "🟢"}
                          </p>
                          {caracterizaciones.length > 0 && (
                            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                              <i className="fas fa-eye" style={{ marginRight: "2px" }}></i> Ver ítems
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* MODAL: DETALLE DE RESPUESTAS POR SESIÓN Y DIMENSIÓN DE LA ENCUESTA           */}
          {/* -------------------------------------------------------------------------- */}
          {modalRespuestasAbierto && sesionActiva && (
            <div
              className="modal-overlay"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "1rem"
              }}
            >
              <div
                className="card"
                style={{
                  width: "100%",
                  maxWidth: "860px",
                  maxHeight: "90vh",
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 0,
                  overflow: "hidden"
                }}
              >
                {/* Encabezado del Modal */}
                <div
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderBottom: "1px solid var(--border-light)",
                    background: "linear-gradient(135deg, #FFFFFF 0%, var(--surface-subtle) 100%)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                        Respuestas de la Encuesta de Caracterización
                      </h3>
                      <span className={`badge ${riskBadgeClass(sesionActiva.riesgoGlobal)}`} style={{ fontSize: "0.75rem" }}>
                        Riesgo {sesionActiva.riesgoGlobal}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Estudiante: <strong>{estudiante.nombres} {estudiante.apellidos}</strong> ({estudiante.codigo}) • Semestre {estudiante.semestre} • Fecha: {sesionActiva.fecha}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalRespuestasAbierto(false)}
                    style={{ background: "none", border: "none", fontSize: "1.2rem", color: "var(--text-muted)", cursor: "pointer", padding: "0.25rem" }}
                  >
                    <i className="fas fa-xmark"></i>
                  </button>
                </div>

                {/* Filtros por Dimensión (Botones) */}
                <div style={{ padding: "0.75rem 1.5rem", borderBottom: "1px solid var(--border-light)", background: "#FFFFFF" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Filtrar por Dimensión:
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${filtroDimModal === "TODAS" ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setFiltroDimModal("TODAS")}
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                    >
                      Todas ({sesionActiva.detalles?.length || 34})
                    </button>
                    {Object.entries(DIMENSIONES_INFO).map(([k, c]) => {
                      const cantidad = sesionActiva.detalles?.filter((d) => (d.dim === "GEST PROG" ? "GEST_PROG" : d.dim) === k).length || 0;
                      const activa = filtroDimModal === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setFiltroDimModal(k)}
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.6rem",
                            background: activa ? c.color : c.bg,
                            color: activa ? "#FFFFFF" : c.color,
                            border: `1px solid ${c.color}`
                          }}
                        >
                          <i className={`fas ${c.icon}`} style={{ marginRight: "0.25rem" }}></i>
                          {c.label} ({cantidad})
                        </button>
                      );
                    })}
                  </div>

                  {/* Buscador de preguntas dentro del modal */}
                  <div style={{ position: "relative" }}>
                    <i className="fas fa-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.8rem" }}></i>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Buscar por texto de pregunta o respuesta..."
                      value={busquedaPregunta}
                      onChange={(e) => setBusquedaPregunta(e.target.value)}
                      style={{ paddingLeft: "32px", fontSize: "0.85rem", height: "34px" }}
                    />
                  </div>
                </div>

                {/* Lista / Tabla de Respuestas */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem" }}>
                  {respuestasFiltradas.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      <i className="fas fa-circle-question" style={{ fontSize: "2rem", marginBottom: "0.5rem", display: "block" }}></i>
                      No hay preguntas que coincidan con los filtros aplicados.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {respuestasFiltradas.map((item) => {
                        const dimKey = (item.dim === "GEST PROG" ? "GEST_PROG" : item.dim) || "IND";
                        const cfg = DIMENSIONES_INFO[dimKey] || DIMENSIONES_INFO.IND;
                        const esRiesgoAlto = item.nivelRiesgo === "Alto";
                        const esRiesgoMedio = item.nivelRiesgo === "Medio";

                        return (
                          <div
                            key={item.id || item.orden}
                            style={{
                              padding: "0.85rem 1rem",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-light)",
                              background: "var(--surface-card)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "1rem"
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                                <span style={{ fontWeight: 700, color: "var(--brand-primary)", fontSize: "0.85rem" }}>
                                  #{item.orden}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                    padding: "0.15rem 0.5rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: cfg.bg,
                                    color: cfg.color
                                  }}
                                >
                                  {dimKey.replace("_", " ")}
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-main)", fontWeight: 500 }}>
                                {item.texto}
                              </p>
                            </div>

                            {/* Opción respondida por el estudiante */}
                            <div style={{ textAlign: "right", minWidth: "160px", flexShrink: 0 }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "0.3rem 0.75rem",
                                  borderRadius: "20px",
                                  fontSize: "0.8rem",
                                  fontWeight: 700,
                                  background: esRiesgoAlto ? "var(--risk-high-bg)" : esRiesgoMedio ? "var(--risk-medium-bg)" : "var(--risk-low-bg)",
                                  color: esRiesgoAlto ? "var(--risk-high-text)" : esRiesgoMedio ? "var(--risk-medium-text)" : "var(--risk-low-text)",
                                  border: `1px solid ${esRiesgoAlto ? "var(--risk-high-border)" : esRiesgoMedio ? "var(--risk-medium-border)" : "var(--risk-low-border)"}`
                                }}
                              >
                                {item.opcionTexto || `Valor: ${item.valor}`}
                              </span>
                              <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                Impacto: {item.nivelRiesgo}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer del Modal */}
                <div
                  style={{
                    padding: "0.85rem 1.5rem",
                    borderTop: "1px solid var(--border-light)",
                    background: "var(--surface-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Total de respuestas evaluadas: <strong>{sesionActiva.detalles?.length || 34}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setModalRespuestasAbierto(false)}
                    style={{ minWidth: "100px" }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
