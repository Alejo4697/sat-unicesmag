/* ==========================================================================
   Feature: Monitoreo
   Migración real de dashboard.html + assets/js/dashboard.js: barra de
   filtros, las 4 tarjetas KPI y las dos gráficas Chart.js. La gráfica de
   "Semaforización por Campos de Riesgo" ya no usa los números inventados
   del mockup: se calcula de verdad a partir de los envíos reales del
   instrumento de Caracterización (GET /api/dashboard/riesgo-dimensiones).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import ChartCanvas from "../../shared/charts/ChartCanvas.jsx";
import { getDashboardStats, getRiesgoPorDimensiones } from "./api.js";

const DIM_LABELS = {
  IND: "Individual (IND)",
  INS: "Institucional (INS)",
  ACA: "Académico (ACA)",
  SOC: "Socioeconómico (SOC)",
  GEST_PROG: "Gestión Prog (GEST PROG)"
};
const ORDEN_DIM = ["IND", "INS", "ACA", "SOC", "GEST_PROG"];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [riesgoDim, setRiesgoDim] = useState(null);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState("2025-2");
  const [semestre, setSemestre] = useState("todos");

  useEffect(() => {
    Promise.all([getDashboardStats(), getRiesgoPorDimensiones()])
      .then(([s, r]) => {
        setStats(s);
        setRiesgoDim(r);
      })
      .catch((err) => setError(err.message));
  }, []);

  const doughnutData = useMemo(() => {
    if (!stats) return null;
    return {
      labels: ["Encuestados (Semestre 1)", "Encuestados (Semestre 4)", "Encuestados (Semestre 7)", "Faltantes por Encuestar"],
      datasets: [
        {
          data: [
            stats.porSemestre.semestre1.encuestados,
            stats.porSemestre.semestre4.encuestados,
            stats.porSemestre.semestre7.encuestados,
            stats.totalFaltantesCaracterizacion
          ],
          backgroundColor: ["#002855", "#0B3C5D", "#D4AF37", "#CBD5E1"]
        }
      ]
    };
  }, [stats]);

  const barData = useMemo(() => {
    if (!riesgoDim) return null;
    const dims = ORDEN_DIM.filter((d) => riesgoDim.dimensiones[d]);
    return {
      labels: dims.map((d) => DIM_LABELS[d]),
      datasets: [
        { label: "Riesgo Alto 🔴", data: dims.map((d) => riesgoDim.dimensiones[d].Alto), backgroundColor: "#DC2626" },
        { label: "Riesgo Medio 🟠", data: dims.map((d) => riesgoDim.dimensiones[d].Medio), backgroundColor: "#D97706" },
        { label: "Riesgo Bajo 🟢", data: dims.map((d) => riesgoDim.dimensiones[d].Bajo), backgroundColor: "#059669" }
      ]
    };
  }, [riesgoDim]);

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    }),
    []
  );

  const doughnutOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }), []);

  return (
    <AppLayout titulo="Tablero de Permanencia Estudiantil" breadcrumb={`Monitoreo Institucional / Periodo ${stats?.periodoActual || ""}`}>
      {error && <div className="auth-error">{error}</div>}

      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: 170 }}>
          <label className="form-label" style={{ fontSize: "0.75rem" }}>
            Periodo Académico
          </label>
          <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="2025-2">2025 II (Activo)</option>
            <option value="2025-1">2025 I</option>
            <option value="2024-2">2024 II</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 170 }}>
          <label className="form-label" style={{ fontSize: "0.75rem" }}>
            Semestre Focalizado
          </label>
          <select className="form-select" value={semestre} onChange={(e) => setSemestre(e.target.value)}>
            <option value="todos">Semestres 1, 4 y 7</option>
            <option value="1">Semestre 1 (Ingreso)</option>
            <option value="4">Semestre 4 (Intermedio)</option>
            <option value="7">Semestre 7 (Avanzado)</option>
          </select>
        </div>

        <div>
          <Link to="/reportes" className="btn btn-primary" style={{ height: 36, display: "inline-flex", alignItems: "center" }}>
            <i className="fas fa-file-arrow-down"></i>&nbsp;Exportar Datos (RQF21)
          </Link>
        </div>
      </div>

      {stats && (
        <div className="dashboard-grid">
          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Total Matriculados</span>
              <span className="kpi-value">{stats.totalEstudiantesMatriculados.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-blue">
              <i className="fas fa-graduation-cap"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Encuestas Completadas</span>
              <span className="kpi-value">{stats.totalEncuestadosCaracterizacion.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-green">
              <i className="fas fa-circle-check"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Pendientes por Encuestar</span>
              <span className="kpi-value">{stats.totalFaltantesCaracterizacion.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-orange">
              <i className="fas fa-clock"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Estudiantes en Riesgo Alto</span>
              <span className="kpi-value">{stats.distribucionRiesgo.alto.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-red">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card chart-card">
          <div className="card-header">
            <h3 className="card-title">Semaforización por Campos de Riesgo (RQF10)</h3>
            <span className="badge badge-risk-high">Periodo 2025 II</span>
          </div>
          {barData && riesgoDim.totalEnvios > 0 ? (
            <ChartCanvas type="bar" data={barData} options={barOptions} height={280} />
          ) : (
            <p className="page-placeholder" style={{ padding: "1rem 0" }}>
              Aún no hay envíos del instrumento de Caracterización — esta gráfica se llena a medida que los estudiantes lo diligencian.
            </p>
          )}
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <h3 className="card-title">Cobertura de Caracterización (Semestres 1, 4, 7)</h3>
            <span className="badge badge-status-process">Avance</span>
          </div>
          {doughnutData && <ChartCanvas type="doughnut" data={doughnutData} options={doughnutOptions} height={280} />}
        </div>
      </div>
    </AppLayout>
  );
}
