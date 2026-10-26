/* ==========================================================================
   Feature: Monitoreo (Tablero General)
   ==========================================================================
   Sección oficial de Resultados y Avances de la Encuesta de Caracterización
   y Permanencia Institucional.
   
   Autorizado para:
     - Administrador
     - Coordinador de Acompañamiento
     - Docente Acompañante (restringido a la información de su programa)
     - Directivo (restringido a la información de su programa)
   
   Características:
     - 4 Tarjetas KPI: Total Estudiantes, Periodo Actual, Encuestados, Faltantes.
     - Filtros Dinámicos: Campo de Preguntas (Individual, Asistencial, Académico,
       Socioeconómico), Periodo Académico, Semestre (1, 4, 7, Todos) y Programa.
     - Gráficos Dinámicos interactivos: Cobertura de Encuesta (Doughnut),
       Semaforización por Campos de Riesgo (Stacked Bar) y Avance por Semestres (Bar).
     - Exportación a Microsoft Excel (.xlsx) nativo con estilos institucionales.
     - Bandeja de Casos para Docentes Acompañantes y Profesionales.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import ChartCanvas from "../../shared/charts/ChartCanvas.jsx";
import { getDashboardStats, getRiesgoPorDimensiones, getResultadosCaracterizacion } from "./api.js";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { descargarExcel } from "../../shared/utils/excel.js";
import { formatDateTime } from "../../shared/utils/formatDateTime.js";

const DIM_LABELS = {
  IND: "Individual (IND)",
  INS: "Asistencial (INS)",
  ACA: "Académico (ACA)",
  SOC: "Socioeconómico (SOC)",
  GEST_PROG: "Gestión Prog (GEST PROG)"
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [riesgoDim, setRiesgoDim] = useState(null);
  const [caracData, setCaracData] = useState(null);
  const [cargandoCarac, setCargandoCarac] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);

  // Filtros de búsqueda para Caracterización
  const [campo, setCampo] = useState("todos"); // 'todos', 'IND', 'INS', 'ACA', 'SOC'
  const [periodo, setPeriodo] = useState("2025-2");
  const [semestre, setSemestre] = useState("todos"); // 'todos', '1', '4', '7'
  const [programa, setPrograma] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  // Pestaña activa (para roles con casos asignados)
  const [tabActiva, setTabActiva] = useState("caracterizacion"); // 'caracterizacion' | 'casos'

  // Determinar permisos de rol y restricción de programa
  const rol = user?.rol;
  const cargoLower = String(user?.cargo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esAdmin = rol === "admin";
  const esCoordinador = esAdmin || cargoLower.includes("coordinador");
  const esDocenteAcompanante = cargoLower.includes("docente") || cargoLower.includes("acompana") || cargoLower.includes("tutor") || cargoLower.includes("tiempo completo") || cargoLower.includes("medio tiempo") || cargoLower.includes("catedra");
  const esDirectivo = rol === "directivo";
  const puedeVerCaracterizacion = esAdmin || esCoordinador || esDocenteAcompanante || esDirectivo || rol === "profesional";
  const esRestringidoAPrograma = (esDocenteAcompanante || esDirectivo) && !esCoordinador && !esAdmin;
  const programaAsignado = user?.programa || null;

  // Cargar estadísticas generales del dashboard
  useEffect(() => {
    Promise.all([getDashboardStats(), getRiesgoPorDimensiones()])
      .then(([s, r]) => {
        setStats(s);
        setRiesgoDim(r);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Cargar / refrescar resultados de caracterización dinámicamente cuando cambian los filtros
  useEffect(() => {
    if (!puedeVerCaracterizacion) {
      setCargandoCarac(false);
      return;
    }

    setCargandoCarac(true);
    const programaEfectivo = esRestringidoAPrograma && programaAsignado ? programaAsignado : programa;

    getResultadosCaracterizacion({
      periodo,
      semestre,
      campo,
      programa: programaEfectivo,
      q: busqueda
    })
      .then((data) => {
        setCaracData(data);
      })
      .catch((err) => {
        console.error("Error al obtener resultados de caracterización:", err);
      })
      .finally(() => {
        setCargandoCarac(false);
      });
  }, [puedeVerCaracterizacion, periodo, semestre, campo, programa, busqueda, esRestringidoAPrograma, programaAsignado]);

  // Exportar los resultados filtrados a Excel
  const handleExportarExcel = async () => {
    if (!caracData || !caracData.estudiantes || caracData.estudiantes.length === 0) {
      alert("No hay registros para exportar con los filtros seleccionados.");
      return;
    }

    try {
      setExportando(true);
      const columnas = [
        { key: "codigo", header: "Código Estudiante" },
        { key: "documento", header: "No. Documento" },
        { key: "nombreCompleto", header: "Estudiante" },
        { key: "programa", header: "Programa Académico" },
        { key: "semestre", header: "Semestre" },
        { key: "periodo", header: "Periodo Académico" },
        { key: "estadoEncuesta", header: "Estado Encuesta" },
        { key: "riesgoGlobal", header: "Riesgo Global Permanencia" },
        { key: "puntajeGlobal", header: "Puntaje Riesgo" },
        { key: "alertaIndividual", header: "Alerta Campo Individual (IND)" },
        { key: "alertaAsistencial", header: "Alerta Campo Asistencial (INS)" },
        { key: "alertaAcademica", header: "Alerta Campo Académico (ACA)" },
        { key: "alertaSocioeconomica", header: "Alerta Campo Socioeconómico (SOC)" }
      ];

      const nombreArchivo = `Resultados_Encuesta_Permanencia_${periodo}_Semestre_${semestre}_Campo_${campo}.xlsx`;

      await descargarExcel(caracData.estudiantes, columnas, nombreArchivo, {
        hoja: "Permanencia Estudiantil",
        vacio: "Sin evaluar"
      });
    } catch (err) {
      console.error("Fallo al exportar a Excel:", err);
      alert("Error al generar el archivo Excel: " + err.message);
    } finally {
      setExportando(false);
    }
  };

  // -------------------------------------------------------------
  // Configuración de Gráficos Dinámicos
  // -------------------------------------------------------------

  // Gráfico 1: Cobertura de la Encuesta (Doughnut)
  const doughnutCoberturaData = useMemo(() => {
    if (!caracData?.kpis) return null;
    const { encuestados, faltantes } = caracData.kpis;
    return {
      labels: ["Encuestas Respondidas", "Faltantes por Encuestar"],
      datasets: [
        {
          data: [encuestados, Math.max(0, faltantes)],
          backgroundColor: ["#002855", "#E2E8F0"],
          borderWidth: 2,
          borderColor: "#FFFFFF"
        }
      ]
    };
  }, [caracData]);

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }),
    []
  );

  // Gráfico 2: Semaforización por Campos de Riesgo (Stacked Bar)
  const barCamposData = useMemo(() => {
    if (!caracData?.distribucionPorDimension) return null;
    const dims = ["IND", "INS", "ACA", "SOC"];

    // Si hay un campo filtrado específico, mostramos solo esa dimensión o la resaltamos
    const dimsMostrar = campo !== "todos" && dims.includes(campo) ? [campo] : dims;

    return {
      labels: dimsMostrar.map((d) => DIM_LABELS[d]),
      datasets: [
        {
          label: "Riesgo Alto",
          data: dimsMostrar.map((d) => caracData.distribucionPorDimension[d]?.Alto || 0),
          backgroundColor: "#DC2626"
        },
        {
          label: "Riesgo Medio",
          data: dimsMostrar.map((d) => caracData.distribucionPorDimension[d]?.Medio || 0),
          backgroundColor: "#D97706"
        },
        {
          label: "Riesgo Bajo",
          data: dimsMostrar.map((d) => caracData.distribucionPorDimension[d]?.Bajo || 0),
          backgroundColor: "#059669"
        }
      ]
    };
  }, [caracData, campo]);

  const barStackedOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      }
    }),
    []
  );

  // Gráfico 3: Cobertura por Semestres Focalizados (1, 4, 7)
  const barSemestresData = useMemo(() => {
    if (!caracData?.porSemestre) return null;
    const s1 = caracData.porSemestre.semestre1;
    const s4 = caracData.porSemestre.semestre4;
    const s7 = caracData.porSemestre.semestre7;

    return {
      labels: ["Semestre 1 (Ingreso)", "Semestre 4 (Intermedio)", "Semestre 7 (Avanzado)"],
      datasets: [
        {
          label: "Encuestados",
          data: [s1?.encuestados || 0, s4?.encuestados || 0, s7?.encuestados || 0],
          backgroundColor: "#002855"
        },
        {
          label: "Faltantes",
          data: [s1?.faltantes || 0, s4?.faltantes || 0, s7?.faltantes || 0],
          backgroundColor: "#CBD5E1"
        }
      ]
    };
  }, [caracData]);

  const barSemestresOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }),
    []
  );

  // Titulo y Breadcrumb del Layout
  const titulo = esDocenteAcompanante
    ? `Tablero de Permanencia - Docente Acompañante (${programaAsignado || "Mi Programa"})`
    : esCoordinador
      ? "Tablero de Caracterización y Permanencia Institucional"
      : "Tablero General de Monitoreo";

  const breadcrumb = esRestringidoAPrograma
    ? `Monitoreo / Programa: ${programaAsignado || "Mi Programa"} / Periodo ${periodo}`
    : `Monitoreo Institucional / Periodo ${periodo}`;

  const tieneCasosAsignados = stats?.vista === "profesional" || (esDocenteAcompanante && stats?.misIntervenciones);

  return (
    <AppLayout titulo={titulo} breadcrumb={breadcrumb}>
      {error && <div className="auth-error mb-3">{error}</div>}

      {/* Pestañas para roles con Casos asignados (Docente Acompañante o Profesional) */}
      {tieneCasosAsignados && puedeVerCaracterizacion && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "1px solid var(--border-light)", paddingBottom: "0.5rem" }}>
          <button
            type="button"
            className={`btn ${tabActiva === "caracterizacion" ? "btn-primary" : "btn-light"}`}
            onClick={() => setTabActiva("caracterizacion")}
            style={{ fontWeight: 600 }}
          >
            <i className="fas fa-chart-pie me-2"></i>Resultados de la Encuesta de Permanencia
          </button>
          <button
            type="button"
            className={`btn ${tabActiva === "casos" ? "btn-primary" : "btn-light"}`}
            onClick={() => setTabActiva("casos")}
            style={{ fontWeight: 600 }}
          >
            <i className="fas fa-clipboard-user me-2"></i>Mi Bandeja de Casos ({stats?.resumen?.intervencionesAbiertas || 0})
          </button>
        </div>
      )}

      {/* =========================================================================
          SECCIÓN: RESULTADOS DE LA ENCUESTA DE CARACTERIZACIÓN Y PERMANENCIA
          ========================================================================= */}
      {puedeVerCaracterizacion && tabActiva === "caracterizacion" && (
        <div className="caracterizacion-dashboard-section mb-4">
          {/* Encabezado y banner de alcance */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#002855", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <i className="fas fa-clipboard-check text-primary"></i>
                Avances y Resultados de la Encuesta de Permanencia
              </h2>
              <p className="text-muted" style={{ margin: "3px 0 0", fontSize: "0.85rem" }}>
                Monitoreo diagnóstico psicopedagógico y semaforización de alertas por campos de permanencia.
              </p>
            </div>

            {esRestringidoAPrograma ? (
              <span className="badge" style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", padding: "0.45rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <i className="fas fa-lock"></i>
                Programa asignado: <strong>{programaAsignado || "Tu Programa"}</strong>
              </span>
            ) : (
              <span className="badge" style={{ backgroundColor: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", padding: "0.45rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <i className="fas fa-globe"></i>
                Vista Institucional Global (Acceso Administrativo)
              </span>
            )}
          </div>

          {/* BARRA DE FILTROS DINÁMICOS */}
          <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", background: "var(--surface-card)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", marginBottom: "1.5rem", alignItems: "flex-end", boxShadow: "var(--shadow-xs)" }}>
            {/* Filtro 1: Campo de Preguntas / Dimensiones */}
            <div style={{ flex: "1 1 200px" }}>
              <label className="form-label" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="fas fa-layer-group text-primary"></i> Campo de Preguntas
              </label>
              <select className="form-select" value={campo} onChange={(e) => setCampo(e.target.value)} style={{ fontSize: "0.85rem", height: 38 }}>
                <option value="todos">Todos los Campos (General)</option>
                <option value="IND">Campo Individual</option>
                <option value="INS">Campo Asistencial (Institucional)</option>
                <option value="ACA">Campo Académico</option>
                <option value="SOC">Campo Socioeconómico</option>
              </select>
            </div>

            {/* Filtro 2: Periodo Académico */}
            <div style={{ flex: "1 1 160px" }}>
              <label className="form-label" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="fas fa-calendar-days text-primary"></i> Periodo Académico
              </label>
              <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ fontSize: "0.85rem", height: 38 }}>
                <option value="2025-2">2025 II (Activo)</option>
                <option value="2026-1">2026 I</option>
                <option value="2025-1">2025 I</option>
                <option value="2024-2">2024 II</option>
                <option value="2023-II">2023 II</option>
                <option value="todos">Todos los Periodos</option>
              </select>
            </div>

            {/* Filtro 3: Semestre Focalizado */}
            <div style={{ flex: "1 1 170px" }}>
              <label className="form-label" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="fas fa-graduation-cap text-primary"></i> Semestres
              </label>
              <select className="form-select" value={semestre} onChange={(e) => setSemestre(e.target.value)} style={{ fontSize: "0.85rem", height: 38 }}>
                <option value="todos">Todos los Semestres (1, 4 y 7)</option>
                <option value="1">Semestre 1 (Ingreso)</option>
                <option value="4">Semestre 4 (Intermedio)</option>
                <option value="7">Semestre 7 (Avanzado)</option>
              </select>
            </div>

            {/* Filtro 4: Programa Académico (Selector para Admin/Coordinador, Fijo para Docente Acompañante) */}
            <div style={{ flex: "1 1 230px" }}>
              <label className="form-label" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="fas fa-book-open-reader text-primary"></i> Programa Académico
              </label>
              {esRestringidoAPrograma ? (
                <input
                  type="text"
                  className="form-control"
                  value={programaAsignado || "Programa Asignado"}
                  disabled
                  style={{ fontSize: "0.85rem", height: 38, backgroundColor: "#F8FAFC", cursor: "not-allowed" }}
                />
              ) : (
                <select className="form-select" value={programa} onChange={(e) => setPrograma(e.target.value)} style={{ fontSize: "0.85rem", height: 38 }}>
                  <option value="todos">Todos los Programas</option>
                  {caracData?.metadatos?.programasDisponibles?.map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Filtro 5: Búsqueda rápida por cédula/código/nombre */}
            <div style={{ flex: "1 1 180px" }}>
              <label className="form-label" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="fas fa-search text-primary"></i> Buscar Estudiante
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Cédula, código o nombre..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ fontSize: "0.85rem", height: 38 }}
              />
            </div>

            {/* Botón de Exportación a Excel */}
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportarExcel}
                disabled={exportando || cargandoCarac}
                style={{ height: 38, display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: 600, whiteSpace: "nowrap" }}
                title="Descargar resultados detallados en Microsoft Excel"
              >
                <i className={exportando ? "fas fa-spinner fa-spin" : "fas fa-file-excel"}></i>
                {exportando ? "Generando..." : "Exportar a Excel"}
              </button>
            </div>
          </div>

          {/* TARJETAS KPI (Como se observa en el diagrama manuscrito) */}
          <div className="dashboard-grid">
            {/* KPI 1: Total Estudiantes */}
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Total Estudiantes</span>
                <span className="kpi-value">
                  {cargandoCarac ? "..." : (caracData?.kpis?.totalEstudiantes || 0).toLocaleString("es-CO")}
                </span>
                <span style={{ fontSize: "0.725rem", color: "#64748B", marginTop: "4px" }}>
                  {semestre === "todos" ? "Matriculados en semestres 1, 4 y 7" : `Matriculados en Semestre ${semestre}`}
                </span>
              </div>
              <div className="kpi-icon icon-blue">
                <i className="fas fa-users"></i>
              </div>
            </div>

            {/* KPI 2: Periodo Académico */}
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Periodo Actual</span>
                <span className="kpi-value" style={{ fontSize: "1.35rem" }}>
                  {cargandoCarac ? "..." : (caracData?.periodoActual || periodo)}
                </span>
                <span style={{ fontSize: "0.725rem", color: "#059669", marginTop: "4px", fontWeight: 600 }}>
                  <i className="fas fa-circle-dot me-1"></i>Periodo de Caracterización
                </span>
              </div>
              <div className="kpi-icon icon-blue" style={{ background: "#F0FDF4", color: "#16A34A" }}>
                <i className="fas fa-calendar-check"></i>
              </div>
            </div>

            {/* KPI 3: Encuestados */}
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Encuestas Respondidas</span>
                <span className="kpi-value" style={{ color: "#002855" }}>
                  {cargandoCarac ? "..." : (caracData?.kpis?.encuestados || 0).toLocaleString("es-CO")}
                </span>
                <span style={{ fontSize: "0.725rem", color: "#0284C7", marginTop: "4px", fontWeight: 600 }}>
                  Avance: {cargandoCarac ? "..." : `${caracData?.kpis?.porcentajeAvance || 0}%`}
                </span>
              </div>
              <div className="kpi-icon icon-green">
                <i className="fas fa-file-circle-check"></i>
              </div>
            </div>

            {/* KPI 4: Número de Faltantes */}
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Faltantes por Encuestar</span>
                <span className="kpi-value" style={{ color: "#D97706" }}>
                  {cargandoCarac ? "..." : (caracData?.kpis?.faltantes || 0).toLocaleString("es-CO")}
                </span>
                <span style={{ fontSize: "0.725rem", color: "#D97706", marginTop: "4px" }}>
                  Pendientes de diligenciamiento
                </span>
              </div>
              <div className="kpi-icon icon-orange">
                <i className="fas fa-user-clock"></i>
              </div>
            </div>
          </div>

          {/* GRÁFICOS DINÁMICOS */}
          <div className="dashboard-grid">
            {/* Gráfico 1: Cobertura de la Encuesta */}
            <div className="card chart-card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: "1rem", margin: 0 }}>
                    Cobertura de la Encuesta de Caracterización
                  </h3>
                  <small className="text-muted">
                    {semestre === "todos" ? "Semestres 1, 4 y 7" : `Semestre ${semestre}`} - {periodo}
                  </small>
                </div>
                <span className="badge badge-status-process" style={{ fontSize: "0.75rem" }}>
                  {caracData?.kpis?.porcentajeAvance || 0}% Respondido
                </span>
              </div>
              <div style={{ height: 260, padding: "0.5rem" }}>
                {doughnutCoberturaData ? (
                  <ChartCanvas type="doughnut" data={doughnutCoberturaData} options={doughnutOptions} height={250} />
                ) : (
                  <p className="page-placeholder">Cargando gráfico de cobertura...</p>
                )}
              </div>
            </div>

            {/* Gráfico 2: Semaforización por Campos de Riesgo */}
            <div className="card chart-card">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: "1rem", margin: 0 }}>
                    Semaforización por Campos de Riesgo
                  </h3>
                  <small className="text-muted">
                    {campo === "todos" ? "Distribución en los 4 Campos Evaluados" : `Filtro Activo: ${DIM_LABELS[campo] || campo}`}
                  </small>
                </div>
                <span className="badge badge-risk-high" style={{ fontSize: "0.75rem" }}>
                  Alertas: {caracData?.kpis?.alertasPermanencia || 0}
                </span>
              </div>
              <div style={{ height: 260, padding: "0.5rem" }}>
                {barCamposData ? (
                  <ChartCanvas type="bar" data={barCamposData} options={barStackedOptions} height={250} />
                ) : (
                  <p className="page-placeholder">Cargando semaforización...</p>
                )}
              </div>
            </div>

            {/* Gráfico 3: Cobertura y Avance por Semestres Focalizados (1, 4, 7) */}
            <div className="card" style={{ gridColumn: "span 12" }}>
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 className="card-title" style={{ fontSize: "1rem", margin: 0 }}>
                    Avance Comparativo por Semestres Focalizados (1, 4 y 7)
                  </h3>
                  <small className="text-muted">Comparativa de estudiantes encuestados vs faltantes en cada cohorte clave</small>
                </div>
                <span className="badge" style={{ backgroundColor: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1" }}>
                  Semestres Priorizados SAT
                </span>
              </div>
              <div style={{ height: 220, padding: "0.5rem" }}>
                {barSemestresData ? (
                  <ChartCanvas type="bar" data={barSemestresData} options={barSemestresOptions} height={210} />
                ) : (
                  <p className="page-placeholder">Cargando comparativa semestral...</p>
                )}
              </div>
            </div>
          </div>

          {/* TABLA DETALLADA DE RESULTADOS Y ALERTAS DE PERMANENCIA */}
          <div className="card mt-3">
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h3 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Estudiantes y Alertas de Permanencia
                </h3>
                <small className="text-muted">
                  Mostrando {caracData?.estudiantes?.length || 0} de {caracData?.kpis?.totalEstudiantes || 0} estudiantes según los filtros aplicados.
                </small>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={handleExportarExcel}
                  disabled={exportando || !caracData?.estudiantes?.length}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <i className="fas fa-file-excel text-success"></i>
                  {exportando ? "Exportando..." : "Descargar Excel (.xlsx)"}
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                    <th style={{ width: "95px" }}>Código</th>
                    <th style={{ width: "105px" }}>Documento</th>
                    <th>Estudiante</th>
                    <th>Programa</th>
                    <th style={{ width: "65px", textAlign: "center" }}>Sem.</th>
                    <th style={{ width: "115px", textAlign: "center" }}>Encuesta</th>
                    <th style={{ width: "125px", textAlign: "center" }}>Riesgo Global</th>
                    <th style={{ width: "85px", textAlign: "center" }}>Individual</th>
                    <th style={{ width: "85px", textAlign: "center" }}>Asistencial</th>
                    <th style={{ width: "85px", textAlign: "center" }}>Académico</th>
                    <th style={{ width: "85px", textAlign: "center" }}>Socioec.</th>
                    <th style={{ width: "70px", textAlign: "center" }}>Ficha</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoCarac ? (
                    <tr>
                      <td colSpan={12} className="text-center py-4 text-muted">
                        <i className="fas fa-spinner fa-spin me-2"></i>Cargando resultados de caracterización...
                      </td>
                    </tr>
                  ) : !caracData?.estudiantes || caracData.estudiantes.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-4 text-muted">
                        No se encontraron estudiantes para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    caracData.estudiantes.map((est) => {
                      const badgeRiesgoClass =
                        est.riesgoGlobal === "Alto"
                          ? "badge-risk-high"
                          : est.riesgoGlobal === "Medio"
                            ? "badge-risk-medium"
                            : est.riesgoGlobal === "Bajo"
                              ? "badge-risk-low"
                              : "badge-status-closed";

                      const renderDimBadge = (nivel) => {
                        if (!nivel || nivel === "N/A") {
                          return <span className="text-muted" style={{ fontSize: "0.75rem" }}>-</span>;
                        }
                        const color =
                          nivel === "Alto"
                            ? "#DC2626"
                            : nivel === "Medio"
                              ? "#D97706"
                              : "#059669";
                        const bg =
                          nivel === "Alto"
                            ? "#FEF2F2"
                            : nivel === "Medio"
                              ? "#FFFBEB"
                              : "#ECFDF5";
                        return (
                          <span
                            className="badge"
                            style={{
                              backgroundColor: bg,
                              color,
                              border: `1px solid ${color}40`,
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "0.2rem 0.45rem"
                            }}
                          >
                            {nivel}
                          </span>
                        );
                      };

                      return (
                        <tr key={est.id || est.codigo}>
                          <td>
                            <strong style={{ color: "#002855" }}>{est.codigo}</strong>
                          </td>
                          <td>{est.documento}</td>
                          <td>
                            <strong>{est.nombreCompleto}</strong>
                          </td>
                          <td style={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={est.programa}>
                            {est.programa}
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 600 }}>{est.semestre}</td>
                          <td style={{ textAlign: "center" }}>
                            {est.estadoEncuesta === "RESPONDIDA" ? (
                              <span className="badge" style={{ backgroundColor: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}>
                                <i className="fas fa-check-circle me-1"></i>Respondida
                              </span>
                            ) : (
                              <span className="badge" style={{ backgroundColor: "#FFF7ED", color: "#EA580C", border: "1px solid #FFEDD5" }}>
                                <i className="fas fa-clock me-1"></i>Pendiente
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`badge ${badgeRiesgoClass}`}>
                              {est.riesgoGlobal}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>{renderDimBadge(est.alertaIndividual)}</td>
                          <td style={{ textAlign: "center" }}>{renderDimBadge(est.alertaAsistencial)}</td>
                          <td style={{ textAlign: "center" }}>{renderDimBadge(est.alertaAcademica)}</td>
                          <td style={{ textAlign: "center" }}>{renderDimBadge(est.alertaSocioeconomica)}</td>
                          <td style={{ textAlign: "center" }}>
                            <Link
                              to={`/ficha-estudiante?codigo=${est.codigo}`}
                              className="btn btn-sm btn-light"
                              title="Ver Ficha 360°"
                              style={{ padding: "0.2rem 0.5rem" }}
                            >
                              <i className="fas fa-arrow-up-right-from-square text-primary"></i>
                            </Link>
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
      )}

      {/* =========================================================================
          SECCIÓN: BANDEJA DE CASOS (Para rol profesional o pestaña de casos)
          ========================================================================= */}
      {tieneCasosAsignados && tabActiva === "casos" && stats && (
        <>
          <div className="dashboard-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Intervenciones Abiertas</span>
                <span className="kpi-value">{stats.resumen?.intervencionesAbiertas?.toLocaleString("es-CO") || 0}</span>
              </div>
              <div className="kpi-icon icon-orange">
                <i className="fas fa-clipboard-check"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Intervenciones (Total)</span>
                <span className="kpi-value">{stats.resumen?.intervencionesTotal?.toLocaleString("es-CO") || 0}</span>
              </div>
              <div className="kpi-icon icon-blue">
                <i className="fas fa-list-check"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Remisiones Pendientes</span>
                <span className="kpi-value">{stats.resumen?.remisionesPendientes?.toLocaleString("es-CO") || 0}</span>
              </div>
              <div className="kpi-icon icon-red">
                <i className="fas fa-share-nodes"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Remisiones (Total)</span>
                <span className="kpi-value">{stats.resumen?.remisionesTotal?.toLocaleString("es-CO") || 0}</span>
              </div>
              <div className="kpi-icon icon-green">
                <i className="fas fa-inbox"></i>
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <h3 className="card-title">Mis Intervenciones Registradas</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Estudiante</th>
                    <th>Motivo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.misIntervenciones?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted text-center py-3">
                        No tienes intervenciones registradas.
                      </td>
                    </tr>
                  ) : (
                    stats.misIntervenciones?.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <strong>{i.id}</strong>
                        </td>
                        <td>{i.fecha}</td>
                        <td>{i.codigoEstudiante}</td>
                        <td>{i.detalleVisible ? i.motivo : <em className="text-muted">Detalle confidencial (VBG)</em>}</td>
                        <td>
                          <span className={`badge ${i.cerrado ? "badge-status-closed" : "badge-status-process"}`}>
                            {i.cerrado ? "Cerrada" : "Abierta"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Mis Remisiones Asignadas</h3>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Estudiante</th>
                    <th>Área Destino</th>
                    <th>Riesgo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.misRemisiones?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted text-center py-3">
                        No tienes remisiones asignadas.
                      </td>
                    </tr>
                  ) : (
                    stats.misRemisiones?.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.id}</strong>
                        </td>
                        <td>{formatDateTime(r.fechaRemision)}</td>
                        <td>{r.codigoEstudiante}</td>
                        <td>{r.areaDestino}</td>
                        <td>{r.nivelRiesgo}</td>
                        <td>
                          <span className="badge badge-status-process">{r.estado}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Rol no configurado */}
      {!puedeVerCaracterizacion && !tieneCasosAsignados && (
        <div className="card">
          <p className="page-placeholder" style={{ padding: "1.5rem 1rem" }}>
            El Tablero General no tiene una vista activa para tu perfil.
          </p>
        </div>
      )}
    </AppLayout>
  );
}
