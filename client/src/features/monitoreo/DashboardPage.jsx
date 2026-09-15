/* ==========================================================================
   Feature: Monitoreo
   Migración real de dashboard.html + assets/js/dashboard.js: barra de
   filtros, las 4 tarjetas KPI y las dos gráficas Chart.js. La gráfica de
   "Semaforización por Campos de Riesgo" ya no usa los números inventados
   del mockup: se calcula de verdad a partir de los envíos reales del
   instrumento de Caracterización (GET /api/dashboard/riesgo-dimensiones).

   El Tablero se segmenta por rol EN EL SERVIDOR (ver dashboard.routes.js):
   el endpoint ya devuelve el payload que le corresponde a cada quién y un
   campo `vista` que dice qué forma tiene. Acá solo se pinta lo recibido —
   no se filtran datos en el cliente:
     - "institucional"        (admin)               -> KPI globales + 2 gráficas (igual que antes).
     - "programa"             (directivo)           -> KPI del programa + semaforización del programa.
     - "profesional"          (profesional)         -> bandeja de "mis casos".
     - "actividades-pendiente"(reporte_actividades) -> aviso: tablero por definir.
     - "no-configurada"       (cualquier otro rol)  -> aviso neutro, sin datos.
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import ChartCanvas from "../../shared/charts/ChartCanvas.jsx";
import { getDashboardStats, getRiesgoPorDimensiones } from "./api.js";
import { formatDateTime } from "../../shared/utils/formatDateTime.js";

const DIM_LABELS = {
  IND: "Individual (IND)",
  INS: "Institucional (INS)",
  ACA: "Académico (ACA)",
  SOC: "Socioeconómico (SOC)",
  GEST_PROG: "Gestión Prog (GEST PROG)"
};
const ORDEN_DIM = ["IND", "INS", "ACA", "SOC", "GEST_PROG"];

const TITULO_POR_VISTA = {
  institucional: "Tablero de Permanencia Estudiantil",
  programa: "Tablero de Permanencia del Programa",
  profesional: "Mi Bandeja de Casos",
  "actividades-pendiente": "Tablero de Actividades",
  "no-configurada": "Tablero General"
};

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

  const vista = stats?.vista;

  // Doughnut de cobertura: solo existe en la vista institucional (usa
  // stats.porSemestre, que las demás vistas no traen).
  const doughnutData = useMemo(() => {
    if (!stats || stats.vista !== "institucional") return null;
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

  const titulo = TITULO_POR_VISTA[vista] || "Tablero de Permanencia Estudiantil";
  const breadcrumb =
    vista === "programa"
      ? `Monitoreo del Programa: ${stats.programa} / Periodo ${stats.periodoActual}`
      : vista === "profesional"
        ? `Monitoreo / ${stats.usuario}`
        : `Monitoreo Institucional / Periodo ${stats?.periodoActual || ""}`;

  const mostrarGraficas = vista === "institucional" || vista === "programa";
  // La barra de Periodo/Semestre solo tiene sentido en las vistas con datos
  // institucionales/de programa (y mientras carga). No se toca su lógica —
  // solo se decide si se renderiza según `vista`.
  const mostrarFiltros = !vista || vista === "institucional" || vista === "programa";

  return (
    <AppLayout titulo={titulo} breadcrumb={breadcrumb}>
      {error && <div className="auth-error">{error}</div>}

      {mostrarFiltros && (
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
      )}

      {/* ---- Vista institucional (admin): sin cambios ---------------------- */}
      {vista === "institucional" && (
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

      {/* ---- Vista programa (directivo): KPI recortados a su programa ----- */}
      {vista === "programa" && (
        <div className="dashboard-grid">
          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Estudiantes del Programa</span>
              <span className="kpi-value">{stats.kpis.estudiantesPrograma.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-blue">
              <i className="fas fa-graduation-cap"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Encuestas Completadas</span>
              <span className="kpi-value">{stats.kpis.encuestadosPrograma.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-green">
              <i className="fas fa-circle-check"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Pendientes por Encuestar</span>
              <span className="kpi-value">{stats.kpis.faltantesPrograma.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-orange">
              <i className="fas fa-clock"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Estudiantes en Riesgo Alto</span>
              <span className="kpi-value">{stats.kpis.riesgoAltoPrograma.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-red">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-label">Alertas</span>
              <span className="kpi-value">{stats.kpis.alertasAbiertasPrograma.toLocaleString("es-CO")}</span>
            </div>
            <div className="kpi-icon icon-orange">
              <i className="fas fa-bell"></i>
            </div>
          </div>
        </div>
      )}

      {/* ---- Vista profesional: bandeja de "mis casos" ------------------- */}
      {vista === "profesional" && (
        <>
          <div className="dashboard-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Intervenciones Abiertas</span>
                <span className="kpi-value">{stats.resumen.intervencionesAbiertas.toLocaleString("es-CO")}</span>
              </div>
              <div className="kpi-icon icon-orange">
                <i className="fas fa-clipboard-check"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Intervenciones (Total)</span>
                <span className="kpi-value">{stats.resumen.intervencionesTotal.toLocaleString("es-CO")}</span>
              </div>
              <div className="kpi-icon icon-blue">
                <i className="fas fa-list-check"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Remisiones Pendientes</span>
                <span className="kpi-value">{stats.resumen.remisionesPendientes.toLocaleString("es-CO")}</span>
              </div>
              <div className="kpi-icon icon-red">
                <i className="fas fa-share-nodes"></i>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-body">
                <span className="kpi-label">Remisiones (Total)</span>
                <span className="kpi-value">{stats.resumen.remisionesTotal.toLocaleString("es-CO")}</span>
              </div>
              <div className="kpi-icon icon-green">
                <i className="fas fa-inbox"></i>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Mis Intervenciones</h3>
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
                  {stats.misIntervenciones.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted" style={{ textAlign: "center" }}>
                        No tienes intervenciones registradas.
                      </td>
                    </tr>
                  )}
                  {stats.misIntervenciones.map((i) => (
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
                  ))}
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
                  {stats.misRemisiones.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-muted" style={{ textAlign: "center" }}>
                        No tienes remisiones asignadas.
                      </td>
                    </tr>
                  )}
                  {stats.misRemisiones.map((r) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ---- Vistas de solo aviso: reporte_actividades / rol no contemplado --- */}
      {(vista === "actividades-pendiente" || vista === "no-configurada") && (
        <div className="card">
          <p className="page-placeholder" style={{ padding: "1.5rem 1rem" }}>
            {stats.mensaje}
          </p>
        </div>
      )}

      {/* ---- Gráficas: institucional (2) y programa (solo semaforización) - */}
      {mostrarGraficas && (
        <div className="dashboard-grid">
          <div className="card chart-card">
            <div className="card-header">
              <h3 className="card-title">Semaforización por Campos de Riesgo (RQF10)</h3>
              <span className="badge badge-risk-high">
                {vista === "programa" ? `Programa: ${stats.programa}` : "Periodo 2025 II"}
              </span>
            </div>
            {barData && riesgoDim.totalEnvios > 0 ? (
              <ChartCanvas type="bar" data={barData} options={barOptions} height={280} />
            ) : (
              <p className="page-placeholder" style={{ padding: "1rem 0" }}>
                Aún no hay envíos del instrumento de Caracterización — esta gráfica se llena a medida que los estudiantes lo diligencian.
              </p>
            )}
          </div>

          {vista === "institucional" && (
            <div className="card chart-card">
              <div className="card-header">
                <h3 className="card-title">Cobertura de Caracterización (Semestres 1, 4, 7)</h3>
                <span className="badge badge-status-process">Avance</span>
              </div>
              {doughnutData && <ChartCanvas type="doughnut" data={doughnutData} options={doughnutOptions} height={280} />}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
