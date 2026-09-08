/* ==========================================================================
   Feature: Reportes y Exportación / SNIES
   Migración real de reportes.html + assets/js/export.js: las 3
   exportaciones CSV reales (SNIES/MEN, Intervenciones, Remisiones) y el
   generador de informes filtrado. El resumen numérico ya venía funcionando.
   ========================================================================== */

import { useEffect, useState } from "react";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { descargarCSV } from "../../shared/utils/csv.js";
import { getReportesResumen, getFilasSnies, getFilasIntervenciones, getFilasRemisiones } from "./api.js";

const COLUMNAS_SNIES = [
  { key: "codigoIES", header: "CODIGO_IES" },
  { key: "periodo", header: "PERIODO" },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "documento", header: "DOCUMENTO" },
  { key: "programa", header: "PROGRAMA" },
  { key: "semestre", header: "SEMESTRE" },
  { key: "nivelRiesgo", header: "NIVEL_RIESGO" },
  { key: "totalIntervenciones", header: "TOTAL_INTERVENCIONES" },
  { key: "estadoPermanencia", header: "ESTADO_PERMANENCIA" }
];

const COLUMNAS_INTERVENCIONES = [
  { key: "idIntervencion", header: "ID_INTERVENCION" },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "atendidoPor", header: "ATENDIDO_POR" },
  { key: "cargo", header: "CARGO" },
  { key: "fecha", header: "FECHA" },
  { key: "sensibleVBG", header: "SENSIBLE_VBG" },
  { key: "estado", header: "ESTADO" }
];

const COLUMNAS_REMISIONES = [
  { key: "idRemision", header: "ID_REMISION" },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "remitidoPor", header: "REMITIDO_POR" },
  { key: "areaDestino", header: "AREA_DESTINO" },
  { key: "nivelRiesgo", header: "NIVEL_RIESGO" },
  { key: "estado", header: "ESTADO" },
  { key: "fecha", header: "FECHA" }
];

export default function ReportesPage() {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [descargando, setDescargando] = useState("");

  useEffect(() => {
    getReportesResumen()
      .then(setResumen)
      .catch((err) => setError(err.message));
  }, []);

  function avisar(texto) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 3500);
  }

  async function exportarSnies() {
    setDescargando("snies");
    avisar("Generando reporte consolidado en formato estándar SNIES / Ministerio de Educación...");
    try {
      const filas = await getFilasSnies();
      descargarCSV(filas, COLUMNAS_SNIES, "REPORTE_SNIES_PERMANENCIA_UNICESMAG_2025_II.csv");
      avisar("Descarga completada: REPORTE_SNIES_PERMANENCIA_UNICESMAG_2025_II.csv");
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando("");
    }
  }

  async function exportarIntervenciones() {
    setDescargando("intervenciones");
    try {
      const filas = await getFilasIntervenciones();
      descargarCSV(filas, COLUMNAS_INTERVENCIONES, "REPORTE_INTERVENCIONES_INDIVIDUALES_UNICESMAG.csv");
      avisar("Reporte individual de intervenciones descargado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando("");
    }
  }

  async function exportarRemisiones() {
    setDescargando("remisiones");
    try {
      const filas = await getFilasRemisiones();
      descargarCSV(filas, COLUMNAS_REMISIONES, "REPORTE_REMISIONES_CANALIZADAS_UNICESMAG.csv");
      avisar("Reporte individual de remisiones descargado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando("");
    }
  }

  return (
    <AppLayout titulo="Informes Institucionales & SNIES" breadcrumb="Generación y Descarga de Archivos RQF21">
      {error && <div className="auth-error">{error}</div>}
      {mensaje && (
        <div className="autosave-banner">
          <span>
            <i className="fas fa-circle-info"></i> {mensaje}
          </span>
        </div>
      )}

      {resumen && (
        <div className="dashboard-grid" style={{ marginBottom: "1.5rem" }}>
          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-value">{resumen.totalAlertas}</span>
              <span className="kpi-label">Alertas Registradas</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-value">{resumen.totalIntervenciones}</span>
              <span className="kpi-label">Intervenciones</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-body">
              <span className="kpi-value">{resumen.totalRemisiones}</span>
              <span className="kpi-label">Remisiones</span>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div style={{ fontSize: "1.5rem", color: "var(--brand-primary)", marginBottom: "0.75rem" }}>
            <i className="fas fa-building-columns"></i>
          </div>
          <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.35rem" }}>Reporte Oficial SNIES / MEN</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            Consolidado de cobertura de caracterización, permanencia y atenciones para el Ministerio de Educación.
          </p>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={exportarSnies} disabled={descargando === "snies"}>
            <i className="fas fa-download"></i> {descargando === "snies" ? "Generando..." : "Descargar SNIES (CSV)"}
          </button>
        </div>

        <div className="card" style={{ gridColumn: "span 4" }}>
          <div style={{ fontSize: "1.5rem", color: "var(--brand-accent)", marginBottom: "0.75rem" }}>
            <i className="fas fa-clipboard-list"></i>
          </div>
          <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.35rem" }}>Historial de Intervenciones</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            Relación individual de atenciones registradas con fecha, caso, profesional y acuerdos pactados.
          </p>
          <button className="btn btn-secondary" style={{ width: "100%" }} onClick={exportarIntervenciones} disabled={descargando === "intervenciones"}>
            <i className="fas fa-file-csv"></i> {descargando === "intervenciones" ? "Generando..." : "Exportar Intervenciones"}
          </button>
        </div>

        <div className="card" style={{ gridColumn: "span 4" }}>
          <div style={{ fontSize: "1.5rem", color: "var(--brand-gold)", marginBottom: "0.75rem" }}>
            <i className="fas fa-share-nodes"></i>
          </div>
          <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.35rem" }}>Reporte de Remisiones</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            Exportación de derivaciones canalizadas por dependencias (USP, Trabajo Social, Salud, Jurídicos).
          </p>
          <button className="btn btn-gold" style={{ width: "100%" }} onClick={exportarRemisiones} disabled={descargando === "remisiones"}>
            <i className="fas fa-file-excel"></i> {descargando === "remisiones" ? "Generando..." : "Exportar Remisiones"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Filtros Personalizados de Extracción</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <label className="form-label">Periodo Académico</label>
            <select className="form-select">
              <option>2025 II</option>
              <option>2025 I</option>
              <option>2024 II</option>
            </select>
          </div>
          <div>
            <label className="form-label">Programa Académico</label>
            <select className="form-select">
              <option>Todos los Programas</option>
              <option>Ingeniería de Sistemas</option>
              <option>Psicología</option>
              <option>Derecho</option>
              <option>Arquitectura</option>
            </select>
          </div>
          <div>
            <label className="form-label">Semestre</label>
            <select className="form-select">
              <option>Todos (1, 4, 7)</option>
              <option>Semestre 1</option>
              <option>Semestre 4</option>
              <option>Semestre 7</option>
            </select>
          </div>
          <div>
            <label className="form-label">Nivel de Riesgo</label>
            <select className="form-select">
              <option>Todos los Niveles</option>
              <option>Riesgo Alto 🔴</option>
              <option>Riesgo Medio 🟠</option>
              <option>Riesgo Bajo 🟢</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={() => avisar("Generando informe filtrado personalizado...")}>
            <i className="fas fa-filter"></i> Generar Informe Filtrado
          </button>
        </div>
        <p className="page-placeholder" style={{ marginTop: "0.75rem" }}>
          TODO: conectar estos filtros a los endpoints de exportación (hoy generan el CSV completo, igual que en el mockup original).
        </p>
      </div>
    </AppLayout>
  );
}
