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
  const [termino, setTermino] = useState(
    searchParams.get("codigo") || searchParams.get("documento") || searchParams.get("q") || ""
  );
  const [estudiante, setEstudiante] = useState(null);
  const [caracterizaciones, setCaracterizaciones] = useState([]);
  const [sesionActivaIdx, setSesionActivaIdx] = useState(0);
  const [programaActivoIdx, setProgramaActivoIdx] = useState(0);

  const programaActivo = useMemo(() => {
    if (!estudiante) return null;
    if (estudiante.programasMatriculados && estudiante.programasMatriculados.length > 0) {
      return estudiante.programasMatriculados[programaActivoIdx] || estudiante.programasMatriculados[0];
    }
    const nivelCalc =
      estudiante.nivel ||
      (String(estudiante.programa || "").toUpperCase().includes("ESPECIALIZA") ||
      String(estudiante.programa || "").toUpperCase().includes("MAESTR")
        ? "POSGRADO"
        : "PREGRADO");
    return {
      codigo: estudiante.codigo,
      programa: estudiante.programa,
      nivel: nivelCalc,
      semestre: estudiante.semestre,
      periodo: estudiante.periodo,
      promedioAcademico: estudiante.promedioAcademico,
      promedioCorte1: estudiante.promedioCorte1 || null,
      promedioCorte2: estudiante.promedioCorte2 || null,
      promedioCorte3: estudiante.promedioCorte3 || null,
      inasistenciasAcumuladas: estudiante.inasistenciasAcumuladas || 0,
      totalAsignaturas: estudiante.totalAsignaturas || (estudiante.asignaturas?.length || 0),
      asignaturasEvaluadas: estudiante.asignaturasEvaluadas || 0,
      materiasAprobadas: estudiante.materiasAprobadas || 0,
      materiasEnRiesgo: estudiante.materiasEnRiesgo || 0,
      materiasPendientes: estudiante.materiasPendientes || 0,
      jornada: estudiante.jornada || "DIURNA",
      estado: "ACTIVA",
      asignaturas: estudiante.asignaturas || []
    };
  }, [estudiante, programaActivoIdx]);

  // Selector de matrícula: se llena cuando el documento buscado tiene más
  // de un código asociado (ej. pregrado + posgrado simultáneos).
  const [selectorMatriculas, setSelectorMatriculas] = useState(null);

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

  async function cargarPorIdentificador(idOParam) {
    if (!idOParam) return;
    setCargando(true);
    setError("");
    setSelectorMatriculas(null);
    try {
      const est = await getEstudiante(idOParam);
      if (est?.multiple) {
        setEstudiante(null);
        setSelectorMatriculas(est);
        return;
      }
      const carList = await getCaracterizacionesEstudiante(est.codigo || idOParam).catch(() => []);
      setEstudiante(est);
      setCaracterizaciones(carList || []);
      setSesionActivaIdx(0);
      setProgramaActivoIdx(0);
    } catch (err) {
      setError(err.message);
      setEstudiante(null);
    } finally {
      setCargando(false);
    }
  }

  // Continúa el flujo normal una vez elegida una matrícula del selector.
  function elegirMatricula(codigo) {
    setSelectorMatriculas(null);
    setSearchParams({ codigo });
    cargarPorIdentificador(codigo);
  }

  useEffect(() => {
    const param = searchParams.get("codigo") || searchParams.get("documento") || searchParams.get("q");
    if (param && param.trim()) {
      setTermino(param.trim());
      cargarPorIdentificador(param.trim());
    } else {
      setTermino("");
      setEstudiante(null);
      setCaracterizaciones([]);
      setError("");
    }
  }, [searchParams]);

  async function buscar(e) {
    if (e) e.preventDefault();
    const q = termino.trim();
    if (!q) {
      setError("Por favor ingrese un número de cédula o código estudiantil para buscar.");
      return;
    }
    setError("");
    setCargando(true);
    setSelectorMatriculas(null);
    try {
      // 1. Intentar resolver directamente por código o cédula exacta
      try {
        const estDirecto = await getEstudiante(q);
        if (estDirecto?.multiple) {
          setEstudiante(null);
          setSelectorMatriculas(estDirecto);
          return;
        }
        if (estDirecto && (estDirecto.codigo || estDirecto.documento)) {
          const carList = await getCaracterizacionesEstudiante(estDirecto.codigo || q).catch(() => []);
          setEstudiante(estDirecto);
          setCaracterizaciones(carList || []);
          setSesionActivaIdx(0);
          setProgramaActivoIdx(0);
          setSearchParams({ codigo: estDirecto.codigo || q });
          return;
        }
      } catch {
        // Continuar con búsqueda por coincidencia
      }

      // 2. Búsqueda por lista y coincidencias parciales
      const resultados = await listEstudiantes(q);
      if (resultados.length === 0) {
        setError("No se encontraron estudiantes con esa cédula o código estudiantil.");
        setEstudiante(null);
        return;
      }
      const exacto = resultados.find(
        (r) =>
          (r.codigo && r.codigo.toLowerCase() === q.toLowerCase()) ||
          (r.documento && r.documento.toLowerCase() === q.toLowerCase())
      );
      const estElegido = exacto || resultados[0];
      const codigoEncontrado = estElegido.codigo || estElegido.documento;
      setSearchParams({ codigo: codigoEncontrado });
      await cargarPorIdentificador(codigoEncontrado);
    } catch (err) {
      setError(err.message);
      setEstudiante(null);
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
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por cédula o código estudiantil..."
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              style={termino ? { paddingRight: "2.5rem" } : {}}
            />
            {termino && (
              <button
                type="button"
                onClick={() => {
                  setTermino("");
                  setEstudiante(null);
                  setError("");
                  setSearchParams({});
                }}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "1rem",
                  padding: "4px"
                }}
                title="Limpiar búsqueda"
              >
                <i className="fas fa-times-circle"></i>
              </button>
            )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={cargando}>
            {cargando ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Buscando...
              </>
            ) : (
              <>
                <i className="fas fa-magnifying-glass"></i> Buscar Estudiante
              </>
            )}
          </button>
        </form>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <i className="fas fa-circle-info" style={{ color: "var(--brand-primary)" }}></i>
          <span>Búsqueda directa por <strong>cédula / documento de identidad</strong> o <strong>código estudiantil</strong> institucional.</span>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

      {/* Estado de carga */}
      {cargando && (
        <div className="card" style={{ textAlign: "center", padding: "3rem", marginTop: "1.5rem" }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: "2rem", color: "var(--brand-primary)", marginBottom: "1rem" }}></i>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: "0.9rem" }}>Consultando información del estudiante en la base de datos...</p>
        </div>
      )}

      {/* Estado inicial limpio cuando no hay estudiante seleccionado */}
      {!estudiante && !cargando && !selectorMatriculas && !error && (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "3.5rem 1.5rem",
            marginTop: "1.5rem",
            border: "1px dashed var(--border-color)",
            background: "var(--surface-subtle)"
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--surface-card)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              boxShadow: "var(--shadow-sm)",
              color: "var(--brand-primary)",
              fontSize: "1.75rem"
            }}
          >
            <i className="fas fa-id-card"></i>
          </div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-main)" }}>
            Búsqueda de Ficha Estudiantil
          </h3>
          <p style={{ maxWidth: 520, margin: "0 auto", fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Ingrese el <strong>número de cédula</strong> o el <strong>código estudiantil</strong> en la barra superior para consultar la información académica, dimensiones de riesgo, historial de intervenciones y remisiones.
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODAL: SELECCIÓN DE MATRÍCULA (documento con varios códigos asociados)      */}
      {/* -------------------------------------------------------------------------- */}
      {selectorMatriculas && (
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
              maxWidth: "560px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--surface-card)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: 0,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border-light)",
                background: "linear-gradient(135deg, #FFFFFF 0%, var(--surface-subtle) 100%)"
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                <i className="fas fa-id-card-clip" style={{ marginRight: 8 }}></i>
                Esta persona tiene varias matrículas
              </h3>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                <strong>
                  {selectorMatriculas.nombres} {selectorMatriculas.apellidos}
                </strong>{" "}
                (Doc: {selectorMatriculas.documento}) tiene {selectorMatriculas.matriculas.length} códigos activos.
                Elige con cuál quieres trabajar:
              </p>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {selectorMatriculas.matriculas.map((m) => (
                <button
                  key={m.codigo}
                  type="button"
                  onClick={() => elegirMatricula(m.codigo)}
                  className="card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--surface-card)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: "var(--brand-primary)", fontSize: "0.95rem" }}>{m.codigo}</span>
                      <span className="badge badge-status-process" style={{ fontSize: "0.65rem" }}>
                        {m.estado || "Activo"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-main)" }}>
                      <i className="fas fa-graduation-cap" style={{ marginRight: 5, color: "var(--text-muted)" }}></i>
                      {m.programa}
                      {m.semestre ? ` — Semestre ${m.semestre}` : ""}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                      <i className="fas fa-calendar" style={{ marginRight: 5 }}></i>
                      Periodo {m.periodo}
                    </div>
                  </div>
                  <i className="fas fa-chevron-right" style={{ color: "var(--text-muted)" }}></i>
                </button>
              ))}
            </div>

            <div
              style={{
                padding: "0.85rem 1.5rem",
                borderTop: "1px solid var(--border-light)",
                background: "var(--surface-subtle)",
                display: "flex",
                justifyContent: "flex-end"
              }}
            >
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectorMatriculas(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>
                      Doc: <strong style={{ color: "var(--text-main)" }}>{estudiante.documento}</strong>
                    </span>
                    <span style={{ color: "var(--border-light)" }}>|</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>
                      Código Activo: <strong style={{ color: "var(--brand-primary)" }}>{programaActivo?.codigo || estudiante.codigo}</strong>
                    </span>
                    {estudiante.tieneDoblePrograma && (
                      <span
                        className="badge"
                        style={{
                          background: "linear-gradient(135deg, #1e3a8a, #7c3aed)",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          padding: "0.22rem 0.6rem",
                          letterSpacing: "0.3px",
                          borderRadius: "12px",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.12)"
                        }}
                      >
                        <i className="fas fa-layer-group" style={{ marginRight: 4 }}></i> Doble Matrícula Institucional (Pregrado + Posgrado)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className={`badge ${riskBadgeClass(sesionActiva?.riesgoGlobal || estudiante.riesgoGlobal)}`}>
                    <i className="fas fa-circle-exclamation"></i> Riesgo Global {sesionActiva?.riesgoGlobal || estudiante.riesgoGlobal}
                  </span>
                </div>
              </div>

              {/* Selector de programas cuando el estudiante cursa pregrado y posgrado simultáneos */}
              {estudiante.programasMatriculados && estudiante.programasMatriculados.length > 1 && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.6rem 0.85rem",
                    background: "var(--surface-subtle)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-main)", fontWeight: 600 }}>
                    <i className="fas fa-arrows-split-up-and-left" style={{ color: "var(--brand-primary)" }}></i>
                    <span>Programas Enlazados:</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {estudiante.programasMatriculados.map((prog, idx) => {
                      const esPosgrado = prog.nivel === "POSGRADO";
                      const seleccionado = programaActivoIdx === idx;
                      return (
                        <button
                          key={prog.id_matriculas || prog.codigo || idx}
                          type="button"
                          onClick={() => setProgramaActivoIdx(idx)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            padding: "0.32rem 0.75rem",
                            borderRadius: "20px",
                            border: seleccionado
                              ? `2px solid ${esPosgrado ? "#7c3aed" : "var(--brand-primary)"}`
                              : "1px solid var(--border-light)",
                            background: seleccionado
                              ? (esPosgrado ? "rgba(124, 58, 237, 0.12)" : "rgba(30, 58, 138, 0.1)")
                              : "var(--surface-card)",
                            color: seleccionado
                              ? (esPosgrado ? "#6d28d9" : "var(--brand-primary)")
                              : "var(--text-muted)",
                            fontWeight: seleccionado ? 700 : 500,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <i className={esPosgrado ? "fas fa-award" : "fas fa-graduation-cap"}></i>
                          <span>
                            <strong>{prog.nivel}:</strong> {prog.programa} ({prog.codigo})
                          </span>
                          {seleccionado && <i className="fas fa-circle-check" style={{ fontSize: "0.8rem", marginLeft: 2 }}></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="student-tags" style={{ marginTop: "0.75rem" }}>
                <span className="tag-item" style={{ fontWeight: 600 }}>
                  <i className={programaActivo?.nivel === "POSGRADO" ? "fas fa-award" : "fas fa-graduation-cap"}></i>
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      background: programaActivo?.nivel === "POSGRADO" ? "#7c3aed" : "var(--brand-primary)",
                      color: "#fff",
                      marginRight: 6
                    }}
                  >
                    {programaActivo?.nivel || "PREGRADO"}
                  </span>
                  {programaActivo?.programa || estudiante.programa}
                </span>
                <span className="tag-item">
                  <i className="fas fa-calendar"></i> Semestre {programaActivo?.semestre || estudiante.semestre} ({programaActivo?.periodo || estudiante.periodo})
                </span>
                {programaActivo?.jornada && (
                  <span className="tag-item">
                    <i className="fas fa-clock"></i> Jornada {programaActivo.jornada}
                  </span>
                )}
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
              key={programaActivo?.codigo || estudiante.codigo}
              codigoEstudiante={programaActivo?.codigo || estudiante.codigo}
              nombreEstudiante={`${estudiante.nombres} ${estudiante.apellidos}`}
            />
          )}

          {tabActiva === "remisiones" && (
            <RemisionesPanel
              key={programaActivo?.codigo || estudiante.codigo}
              codigoEstudiante={programaActivo?.codigo || estudiante.codigo}
              nombreEstudiante={`${estudiante.nombres} ${estudiante.apellidos}`}
            />
          )}

          {tabActiva === "resumen" && (
            <>
              <div className="dashboard-grid">
                {/* -------------------------------------------------------------------------- */}
                {/* TARJETA COMPARATIVA: INFORMACIÓN DE PROGRAMAS MATRICULADOS (PREGRADO / POSGRADO) */}
                {/* -------------------------------------------------------------------------- */}
                <div className="card" style={{ gridColumn: "span 12", padding: "1.25rem 1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                      borderBottom: "1px solid var(--border-light)",
                      paddingBottom: "0.75rem"
                    }}
                  >
                    <div>
                      <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <i className="fas fa-graduation-cap" style={{ color: "var(--brand-primary)" }}></i>
                        <span>
                          {estudiante.tieneDoblePrograma
                            ? "Doble Matrícula Institucional: Pregrado y Posgrado Simultáneos"
                            : "Información de Programas Matriculados"}
                        </span>
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {estudiante.tieneDoblePrograma
                          ? "El estudiante cursa simultáneamente dos programas en UNICESMAG. A continuación se detalla la información académica de ambos niveles:"
                          : "Detalle del programa y nivel formativo en el que se encuentra matriculado el estudiante:"}
                      </p>
                    </div>
                    {estudiante.tieneDoblePrograma && (
                      <span
                        className="badge"
                        style={{
                          background: "rgba(124, 58, 237, 0.1)",
                          color: "#6d28d9",
                          border: "1px solid rgba(124, 58, 237, 0.25)",
                          fontWeight: 700,
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.75rem"
                        }}
                      >
                        <i className="fas fa-check-double" style={{ marginRight: 4 }}></i> 2 Matrículas Activas
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        estudiante.programasMatriculados && estudiante.programasMatriculados.length > 1
                          ? "repeat(auto-fit, minmax(320px, 1fr))"
                          : "1fr",
                      gap: "1rem"
                    }}
                  >
                    {(estudiante.programasMatriculados && estudiante.programasMatriculados.length > 0
                      ? estudiante.programasMatriculados
                      : [programaActivo]
                    ).map((prog, idx) => {
                      const esPosgrado = prog.nivel === "POSGRADO";
                      const esActivo = programaActivoIdx === idx;
                      const colorTema = esPosgrado ? "#7c3aed" : "var(--brand-primary)";
                      const bgTema = esPosgrado ? "rgba(124, 58, 237, 0.04)" : "rgba(30, 58, 138, 0.03)";
                      const borderTema = esActivo ? (esPosgrado ? "#7c3aed" : "var(--brand-primary)") : "var(--border-light)";

                      return (
                        <div
                          key={prog.id_matriculas || prog.codigo || idx}
                          style={{
                            border: `2px solid ${borderTema}`,
                            borderRadius: "var(--radius-md)",
                            background: bgTema,
                            padding: "1rem 1.25rem",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            boxShadow: esActivo ? "0 4px 12px rgba(0,0,0,0.06)" : "none",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.75rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    background: esPosgrado ? "rgba(124, 58, 237, 0.15)" : "var(--brand-primary-50)",
                                    color: colorTema,
                                    fontSize: "1rem"
                                  }}
                                >
                                  <i className={esPosgrado ? "fas fa-award" : "fas fa-graduation-cap"}></i>
                                </span>
                                <div>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      fontSize: "0.68rem",
                                      fontWeight: 800,
                                      letterSpacing: "0.5px",
                                      textTransform: "uppercase",
                                      color: colorTema
                                    }}
                                  >
                                    {prog.nivel}
                                  </span>
                                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-main)" }}>
                                    {prog.programa}
                                  </h4>
                                </div>
                              </div>
                              <span className="badge badge-status-process" style={{ fontSize: "0.68rem" }}>
                                {prog.estado || "Activa"}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gap: "0.6rem 1rem",
                                marginTop: "0.5rem",
                                fontSize: "0.8rem",
                                background: "var(--surface-card)",
                                padding: "0.75rem",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border-light)"
                              }}
                            >
                              <div>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Código Estudiantil</span>
                                <strong style={{ color: colorTema, fontSize: "0.9rem" }}>{prog.codigo}</strong>
                              </div>
                              <div>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Semestre / Periodo</span>
                                <strong>Semestre {prog.semestre} ({prog.periodo})</strong>
                              </div>
                              <div>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Jornada</span>
                                <strong>{prog.jornada || "Diurna"}</strong>
                              </div>
                              <div>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Promedio Ponderado</span>
                                <strong style={{ color: "var(--brand-accent)", fontSize: "0.95rem" }}>
                                  {prog.promedioAcademico !== null && prog.promedioAcademico !== undefined
                                    ? Number(prog.promedioAcademico).toFixed(2)
                                    : "Sin calificar"}
                                </strong>
                              </div>
                              <div>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Materias Evaluadas</span>
                                <strong>
                                  {prog.asignaturasEvaluadas || (prog.asignaturas?.filter(a => a.notaActual !== null)?.length || 0)} de {prog.totalAsignaturas || (prog.asignaturas?.length || 0)}
                                </strong>
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.72rem" }}>Inasistencias Acumuladas</span>
                                <strong style={{ color: (prog.inasistenciasAcumuladas > 5 ? "var(--risk-high-text)" : "var(--text-main)") }}>
                                  {prog.inasistenciasAcumuladas || 0} Horas
                                </strong>
                              </div>
                            </div>
                          </div>

                          {estudiante.programasMatriculados && estudiante.programasMatriculados.length > 1 && (
                            <div style={{ marginTop: "0.85rem", paddingTop: "0.6rem", borderTop: "1px dashed var(--border-light)", display: "flex", justifyContent: "flex-end" }}>
                              {esActivo ? (
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: colorTema, display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <i className="fas fa-circle-check"></i> Activo en la Ficha 360°
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline"
                                  onClick={() => setProgramaActivoIdx(idx)}
                                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem", display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                  <i className="fas fa-arrow-right-arrow-left"></i> Cambiar vista a este programa
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tarjeta de Métricas Académicas */}
                <div className="card" style={{ gridColumn: "span 5", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <i className="fas fa-chart-line" style={{ color: "var(--brand-primary)", fontSize: "1.1rem" }}></i>
                      <h3 className="card-title" style={{ margin: 0 }}>Métricas Académicas</h3>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {estudiante.programasMatriculados && estudiante.programasMatriculados.length > 1 && (
                        <div style={{ display: "flex", gap: "0.2rem" }}>
                          {estudiante.programasMatriculados.map((p, idx) => (
                            <button
                              key={p.codigo || idx}
                              type="button"
                              className={`btn btn-sm ${programaActivoIdx === idx ? "btn-primary" : "btn-outline"}`}
                              onClick={() => setProgramaActivoIdx(idx)}
                              style={{ fontSize: "0.68rem", padding: "0.15rem 0.45rem", height: "auto" }}
                              title={`Ver métricas de ${p.programa}`}
                            >
                              {p.nivel === "POSGRADO" ? "Posgrado" : "Pregrado"}
                            </button>
                          ))}
                        </div>
                      )}
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: programaActivo?.nivel === "POSGRADO" ? "rgba(124, 58, 237, 0.1)" : "var(--brand-primary-50)",
                          color: programaActivo?.nivel === "POSGRADO" ? "#6d28d9" : "var(--brand-primary)"
                        }}
                      >
                        {programaActivo?.nivel || "PREGRADO"}
                      </span>
                    </div>
                  </div>

                  {/* Resumen principal: Promedio Ponderado e Inasistencias */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", textAlign: "center", background: "var(--surface-subtle)", padding: "0.6rem", borderRadius: "var(--radius-sm)" }}>
                    <div>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "var(--brand-accent)", display: "block", lineHeight: 1.1 }}>
                        {programaActivo?.promedioAcademico !== null && programaActivo?.promedioAcademico !== undefined
                          ? Number(programaActivo.promedioAcademico).toFixed(2)
                          : "Sin calificar"}
                      </span>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "2px 0 0", fontWeight: 600 }}>Promedio Ponderado</p>
                    </div>
                    <div style={{ borderLeft: "1px solid var(--border-light)" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: ((programaActivo?.inasistenciasAcumuladas || 0) > 5 ? "var(--risk-high-text)" : "var(--text-main)"), display: "block", lineHeight: 1.1 }}>
                        {programaActivo?.inasistenciasAcumuladas ?? estudiante.inasistenciasAcumuladas ?? 0}
                      </span>
                      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "2px 0 0", fontWeight: 600 }}>Horas Inasistencia</p>
                    </div>
                  </div>

                  {/* Desglose de Notas por Corte del Semestre */}
                  <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-main)" }}>
                        <i className="fas fa-layer-group" style={{ marginRight: 4, color: "var(--brand-primary)" }}></i>
                        Calificaciones Promedio por Corte:
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Periodo {programaActivo?.periodo || "2026-1"}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", textAlign: "center" }}>
                      <div style={{ background: "rgba(30, 58, 138, 0.04)", padding: "0.35rem 0.2rem", borderRadius: "4px" }}>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block" }}>Corte 1</span>
                        <strong style={{ fontSize: "0.95rem", color: programaActivo?.promedioCorte1 !== null && programaActivo?.promedioCorte1 !== undefined ? (Number(programaActivo.promedioCorte1) >= 3.0 ? "var(--risk-low-text)" : "var(--risk-high-text)") : "var(--text-muted)" }}>
                          {programaActivo?.promedioCorte1 !== null && programaActivo?.promedioCorte1 !== undefined ? Number(programaActivo.promedioCorte1).toFixed(2) : "Pendiente"}
                        </strong>
                      </div>
                      <div style={{ background: "rgba(30, 58, 138, 0.04)", padding: "0.35rem 0.2rem", borderRadius: "4px" }}>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block" }}>Corte 2</span>
                        <strong style={{ fontSize: "0.95rem", color: programaActivo?.promedioCorte2 !== null && programaActivo?.promedioCorte2 !== undefined ? (Number(programaActivo.promedioCorte2) >= 3.0 ? "var(--risk-low-text)" : "var(--risk-high-text)") : "var(--text-muted)" }}>
                          {programaActivo?.promedioCorte2 !== null && programaActivo?.promedioCorte2 !== undefined ? Number(programaActivo.promedioCorte2).toFixed(2) : "En curso"}
                        </strong>
                      </div>
                      <div style={{ background: "rgba(30, 58, 138, 0.04)", padding: "0.35rem 0.2rem", borderRadius: "4px" }}>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block" }}>Corte 3</span>
                        <strong style={{ fontSize: "0.95rem", color: programaActivo?.promedioCorte3 !== null && programaActivo?.promedioCorte3 !== undefined ? (Number(programaActivo.promedioCorte3) >= 3.0 ? "var(--risk-low-text)" : "var(--risk-high-text)") : "var(--text-muted)" }}>
                          {programaActivo?.promedioCorte3 !== null && programaActivo?.promedioCorte3 !== undefined ? Number(programaActivo.promedioCorte3).toFixed(2) : "Pendiente"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Estado de Asignaturas: Conteo Aprobadas / Riesgo */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", textAlign: "center", fontSize: "0.72rem" }}>
                    <div style={{ background: "rgba(16, 185, 129, 0.07)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "4px", padding: "0.35rem" }}>
                      <span style={{ color: "#047857", fontWeight: 700, display: "block", fontSize: "1.05rem" }}>
                        {programaActivo?.materiasAprobadas ?? (programaActivo?.asignaturas?.filter(a => a.notaActual !== null && a.notaActual >= 3.0)?.length || 0)}
                      </span>
                      <span style={{ color: "#065f46" }}>Aprobadas (≥3.0)</span>
                    </div>
                    <div style={{ background: "rgba(239, 68, 68, 0.07)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "4px", padding: "0.35rem" }}>
                      <span style={{ color: "#b91c1c", fontWeight: 700, display: "block", fontSize: "1.05rem" }}>
                        {programaActivo?.materiasEnRiesgo ?? (programaActivo?.asignaturas?.filter(a => a.notaActual !== null && a.notaActual < 3.0)?.length || 0)}
                      </span>
                      <span style={{ color: "#991b1b" }}>En Riesgo (&lt;3.0)</span>
                    </div>
                    <div style={{ background: "var(--surface-subtle)", border: "1px solid var(--border-light)", borderRadius: "4px", padding: "0.35rem" }}>
                      <span style={{ color: "var(--text-main)", fontWeight: 700, display: "block", fontSize: "1.05rem" }}>
                        {programaActivo?.totalAsignaturas || (programaActivo?.asignaturas?.length || 0)}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>Total Materias</span>
                    </div>
                  </div>

                  {/* Resumen comparativo de promedios cuando cursa Pregrado y Posgrado */}
                  {estudiante.tieneDoblePrograma && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border-light)",
                        paddingTop: "0.5rem",
                        marginTop: "0.2rem",
                        fontSize: "0.74rem",
                        background: "var(--surface-subtle)",
                        padding: "0.5rem 0.6rem",
                        borderRadius: "var(--radius-sm)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ color: "var(--text-muted)" }}>🎓 Pregrado ({estudiante.programaPregrado?.codigo}):</span>
                        <strong style={{ color: "var(--brand-primary)" }}>
                          {estudiante.programaPregrado?.promedioAcademico !== null && estudiante.programaPregrado?.promedioAcademico !== undefined
                            ? Number(estudiante.programaPregrado.promedioAcademico).toFixed(2)
                            : "Sin calificar"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ color: "var(--text-muted)" }}>🎖️ Posgrado ({estudiante.programaPosgrado?.codigo}):</span>
                        <strong style={{ color: "#7c3aed" }}>
                          {estudiante.programaPosgrado?.promedioAcademico !== null && estudiante.programaPosgrado?.promedioAcademico !== undefined
                            ? Number(estudiante.programaPosgrado.promedioAcademico).toFixed(2)
                            : "Sin calificar"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--border-light)", paddingTop: 3, marginTop: 3 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-main)" }}>Promedio Combinado Global:</span>
                        <strong style={{ color: "var(--brand-accent)" }}>
                          {estudiante.promedioGlobalEstudiante !== null && estudiante.promedioGlobalEstudiante !== undefined
                            ? Number(estudiante.promedioGlobalEstudiante).toFixed(2)
                            : "N/A"}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Listado de asignaturas con sus notas en la tarjeta de métricas */}
                  {programaActivo?.asignaturas && programaActivo.asignaturas.length > 0 ? (
                    <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.5rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-main)", display: "block", marginBottom: "0.3rem" }}>
                        <i className="fas fa-book-bookmark" style={{ marginRight: 4, color: "var(--brand-primary)" }}></i>
                        Calificaciones de Materias ({programaActivo.asignaturas.length}):
                      </span>
                      <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {programaActivo.asignaturas.map((asig, i) => {
                          const nota = asig.notaActual !== null ? Number(asig.notaActual) : null;
                          return (
                            <div
                              key={asig.codigo || i}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.72rem",
                                padding: "0.25rem 0.45rem",
                                borderRadius: "4px",
                                background: "var(--surface-subtle)"
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "230px" }} title={asig.nombre}>
                                <strong>{asig.codigo}</strong> - {asig.nombre}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                                {asig.corte1 !== null && (
                                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                    C1: {Number(asig.corte1).toFixed(1)}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: "3px",
                                    fontSize: "0.72rem",
                                    background: nota !== null ? (nota >= 3.0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)") : "transparent",
                                    color: nota !== null ? (nota >= 3.0 ? "var(--risk-low-text)" : "var(--risk-high-text)") : "var(--text-muted)"
                                  }}
                                >
                                  {nota !== null ? nota.toFixed(1) : "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
                      <i className="fas fa-circle-info" style={{ marginRight: 4 }}></i>
                      No hay notas cargadas para este programa.
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.4rem", fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
                    Programa: <strong>{programaActivo?.programa || estudiante.programa}</strong> ({programaActivo?.codigo || estudiante.codigo})
                  </div>
                </div>

                {/* Tarjeta de Semaforización por Dimensiones y Encuesta */}
                <div className="card" style={{ gridColumn: "span 7" }}>
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

                {/* -------------------------------------------------------------------------- */}
                {/* TABLA DE ASIGNATURAS Y CALIFICACIONES DETALLADAS DEL PROGRAMA              */}
                {/* -------------------------------------------------------------------------- */}
                <div className="card" style={{ gridColumn: "span 12", padding: "1.25rem 1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "1rem",
                      borderBottom: "1px solid var(--border-light)",
                      paddingBottom: "0.75rem"
                    }}
                  >
                    <div>
                      <h3 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <i className="fas fa-book-bookmark" style={{ color: "var(--brand-primary)" }}></i>
                        <span>
                          Calificaciones y Asignaturas — {programaActivo?.programa} ({programaActivo?.nivel || "PREGRADO"})
                        </span>
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Registro académico oficial con notas de corte, promedio ponderado e inasistencias acumuladas.
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      {estudiante.programasMatriculados && estudiante.programasMatriculados.length > 1 && (
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          {estudiante.programasMatriculados.map((p, idx) => (
                            <button
                              key={p.codigo || idx}
                              type="button"
                              className={`btn btn-sm ${programaActivoIdx === idx ? "btn-primary" : "btn-outline"}`}
                              onClick={() => setProgramaActivoIdx(idx)}
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                            >
                              <i className={p.nivel === "POSGRADO" ? "fas fa-award" : "fas fa-graduation-cap"} style={{ marginRight: 4 }}></i>
                              {p.nivel}: {p.codigo}
                            </button>
                          ))}
                        </div>
                      )}

                      <span
                        className="badge"
                        style={{
                          background: "var(--brand-primary-50)",
                          color: "var(--brand-primary)",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          padding: "0.35rem 0.65rem"
                        }}
                      >
                        Promedio del Programa: {programaActivo?.promedioAcademico !== null && programaActivo?.promedioAcademico !== undefined ? Number(programaActivo.promedioAcademico).toFixed(2) : "Sin calificar"}
                      </span>
                    </div>
                  </div>

                  {programaActivo?.asignaturas && programaActivo.asignaturas.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table" style={{ width: "100%", fontSize: "0.83rem", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--surface-subtle)", textAlign: "left", borderBottom: "2px solid var(--border-light)" }}>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, width: "80px" }}>Cód.</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700 }}>Asignatura</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "95px" }}>Corte 1</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "95px" }}>Corte 2</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "95px" }}>Corte 3</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "120px" }}>Definitiva / Actual</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "100px" }}>Inasistencias</th>
                            <th style={{ padding: "0.6rem 0.75rem", fontWeight: 700, textAlign: "center", width: "100px" }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {programaActivo.asignaturas.map((asig, idx) => {
                            const notaNum = asig.notaActual !== null ? Number(asig.notaActual) : null;
                            const notaColor = notaNum === null
                              ? "var(--text-muted)"
                              : notaNum >= 3.0
                              ? "var(--risk-low-text)"
                              : "var(--risk-high-text)";

                            return (
                              <tr
                                key={asig.codigo || idx}
                                style={{
                                  borderBottom: "1px solid var(--border-light)",
                                  background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)"
                                }}
                              >
                                <td style={{ padding: "0.6rem 0.75rem", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.8rem" }}>
                                  {asig.codigo}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, color: "var(--text-main)" }}>
                                  {asig.nombre}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: asig.corte1 !== null ? 600 : 400 }}>
                                  {asig.corte1 !== null ? Number(asig.corte1).toFixed(1) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: asig.corte2 !== null ? 600 : 400 }}>
                                  {asig.corte2 !== null ? Number(asig.corte2).toFixed(1) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center", fontWeight: asig.corte3 !== null ? 600 : 400 }}>
                                  {asig.corte3 !== null ? Number(asig.corte3).toFixed(1) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                                  {notaNum !== null ? (
                                    <span
                                      style={{
                                        display: "inline-block",
                                        fontWeight: 700,
                                        fontSize: "0.9rem",
                                        color: notaColor,
                                        background: notaNum >= 3.0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                        padding: "0.15rem 0.5rem",
                                        borderRadius: "6px"
                                      }}
                                    >
                                      {notaNum.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Sin nota</span>
                                  )}
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                                  <span style={{ fontWeight: asig.inasistencias > 0 ? 700 : 400, color: asig.inasistencias > 4 ? "var(--risk-high-text)" : "var(--text-main)" }}>
                                    {asig.inasistencias} h
                                  </span>
                                </td>
                                <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                                  <span
                                    className={`badge ${
                                      asig.estado === "APROBADA"
                                        ? "badge-status-completed"
                                        : asig.estado === "REPROBADA"
                                        ? "badge-status-error"
                                        : "badge-status-process"
                                    }`}
                                    style={{ fontSize: "0.68rem" }}
                                  >
                                    {asig.estado}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      <i className="fas fa-inbox" style={{ marginRight: 6 }}></i>
                      No hay registros de materias sincronizadas para este programa.
                    </div>
                  )}
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
