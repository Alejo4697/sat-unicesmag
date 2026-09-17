/* ==========================================================================
   Feature: Reportes y Exportación / SNIES
   Migración real de reportes.html + assets/js/export.js: las 3
   exportaciones CSV reales (SNIES/MEN, Intervenciones, Remisiones) y el
   generador de informes filtrado. El resumen numérico ya venía funcionando.
   ==========================================================================
   Los filtros (periodo, programa, semestre, nivel de riesgo) YA NO son
   decorativos: se mandan al backend (GET /reportes/...?periodo=...) y
   recortan tanto la vista previa como el CSV descargado. Sus opciones
   tampoco están quemadas: vienen de GET /reportes/filtros.

   "Vista Previa" muestra en pantalla las primeras filas del reporte
   seleccionado para revisar la información antes de descargarla.
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { descargarCSV, filaComoTexto, formatFechaCSV } from "../../shared/utils/csv.js";
import {
  getReportesResumen,
  getOpcionesFiltros,
  getFilasSnies,
  getFilasIntervenciones,
  getFilasRemisiones
} from "./api.js";

const COLUMNAS_SNIES = [
  { key: "codigoIES", header: "CODIGO_IES" },
  { key: "periodo", header: "PERIODO" },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "documento", header: "DOCUMENTO" },
  { key: "estudiante", header: "ESTUDIANTE" },
  { key: "programa", header: "PROGRAMA" },
  { key: "semestre", header: "SEMESTRE" },
  { key: "nivelRiesgo", header: "NIVEL_RIESGO" },
  { key: "totalIntervenciones", header: "TOTAL_INTERVENCIONES" },
  { key: "totalRemisiones", header: "TOTAL_REMISIONES" },
  { key: "encuestaRespondida", header: "ENCUESTA_RESPONDIDA" },
  { key: "estadoPermanencia", header: "ESTADO_PERMANENCIA" }
];

const COLUMNAS_INTERVENCIONES = [
  { key: "idIntervencion", header: "ID_INTERVENCION" },
  { key: "fecha", header: "FECHA", format: formatFechaCSV },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "estudiante", header: "ESTUDIANTE" },
  { key: "programa", header: "PROGRAMA" },
  { key: "semestre", header: "SEMESTRE" },
  { key: "periodo", header: "PERIODO" },
  { key: "nivelRiesgo", header: "NIVEL_RIESGO" },
  { key: "tipoIntervencion", header: "TIPO_INTERVENCION" },
  { key: "motivo", header: "MOTIVO" },
  { key: "atendidoPor", header: "ATENDIDO_POR" },
  { key: "cargo", header: "CARGO" },
  { key: "sensibleVBG", header: "SENSIBLE_VBG" },
  { key: "estado", header: "ESTADO" }
];

const COLUMNAS_REMISIONES = [
  { key: "idRemision", header: "ID_REMISION" },
  { key: "fecha", header: "FECHA", format: formatFechaCSV },
  { key: "codEstudiante", header: "COD_ESTUDIANTE" },
  { key: "estudiante", header: "ESTUDIANTE" },
  { key: "programa", header: "PROGRAMA_ACADEMICO" },
  { key: "semestre", header: "SEMESTRE" },
  { key: "periodo", header: "PERIODO" },
  { key: "tipoApoyo", header: "TIPO_APOYO" },
  { key: "lineaAccion", header: "LINEA_ACCION" },
  { key: "componente", header: "COMPONENTE" },
  { key: "programaBienestar", header: "PROGRAMA_BIENESTAR" },
  { key: "proyecto", header: "SERVICIO" },
  { key: "areaDestino", header: "AREA_DESTINO" },
  { key: "profesionalAsignado", header: "PROFESIONAL_ASIGNADO" },
  { key: "remitidoPor", header: "REMITIDO_POR" },
  { key: "nivelRiesgo", header: "NIVEL_RIESGO" },
  { key: "escalado48h", header: "ESCALADO_48H" },
  { key: "estado", header: "ESTADO" }
];

// Un solo lugar define cada reporte: título, columnas, cómo se piden las
// filas y con qué nombre se descarga.
const REPORTES = {
  snies: {
    titulo: "Reporte Oficial SNIES / MEN",
    columnas: COLUMNAS_SNIES,
    cargar: getFilasSnies,
    archivo: "REPORTE_SNIES_PERMANENCIA_UNICESMAG.csv"
  },
  intervenciones: {
    titulo: "Historial de Intervenciones",
    columnas: COLUMNAS_INTERVENCIONES,
    cargar: getFilasIntervenciones,
    archivo: "REPORTE_INTERVENCIONES_INDIVIDUALES_UNICESMAG.csv"
  },
  remisiones: {
    titulo: "Reporte de Remisiones",
    columnas: COLUMNAS_REMISIONES,
    cargar: getFilasRemisiones,
    archivo: "REPORTE_REMISIONES_CANALIZADAS_UNICESMAG.csv"
  }
};

const FILTROS_INICIALES = { periodo: "", programa: "", semestre: "", nivelRiesgo: "" };
const FILAS_PREVIA = 15;

export default function ReportesPage() {
  const [resumen, setResumen] = useState(null);
  const [opciones, setOpciones] = useState({ periodos: [], programas: [], semestres: [], nivelesRiesgo: [] });
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [reporteActivo, setReporteActivo] = useState("remisiones");
  const [previa, setPrevia] = useState([]);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [descargando, setDescargando] = useState("");

  useEffect(() => {
    Promise.all([getReportesResumen(), getOpcionesFiltros()])
      .then(([r, o]) => {
        setResumen(r);
        setOpciones(o);
      })
      .catch((err) => setError(err.message));
  }, []);

  function avisar(texto) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 3500);
  }

  const cargarPrevia = useCallback(
    async (clave, filtrosActuales) => {
      setCargandoPrevia(true);
      setError("");
      try {
        setPrevia(await REPORTES[clave].cargar(filtrosActuales));
      } catch (err) {
        setError(err.message);
        setPrevia([]);
      } finally {
        setCargandoPrevia(false);
      }
    },
    []
  );

  // Primera carga y cada vez que cambian los filtros o el reporte elegido.
  useEffect(() => {
    cargarPrevia(reporteActivo, filtros);
  }, [reporteActivo, filtros, cargarPrevia]);

  async function exportar(clave) {
    const reporte = REPORTES[clave];
    setDescargando(clave);
    setError("");
    try {
      const filas = await reporte.cargar(filtros);
      if (!filas.length) {
        avisar("No hay registros que cumplan los filtros seleccionados.");
        return;
      }
      descargarCSV(filas, reporte.columnas, reporte.archivo);
      avisar(`Descarga completada: ${reporte.archivo} (${filas.length} registros).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando("");
    }
  }

  const hayFiltros = Object.values(filtros).some((v) => v !== "");
  const columnasPrevia = REPORTES[reporteActivo].columnas;

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

      {/* ---------------- Filtros (RQF13) ---------------- */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Filtros de Extracción</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label className="form-label" htmlFor="filtro-periodo">Periodo Académico</label>
            <select
              id="filtro-periodo"
              className="form-select"
              value={filtros.periodo}
              onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })}
            >
              <option value="">Todos los periodos</option>
              {opciones.periodos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="filtro-programa">Programa Académico</label>
            <select
              id="filtro-programa"
              className="form-select"
              value={filtros.programa}
              onChange={(e) => setFiltros({ ...filtros, programa: e.target.value })}
            >
              <option value="">Todos los programas</option>
              {opciones.programas.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="filtro-semestre">Semestre</label>
            <select
              id="filtro-semestre"
              className="form-select"
              value={filtros.semestre}
              onChange={(e) => setFiltros({ ...filtros, semestre: e.target.value })}
            >
              <option value="">Todos los semestres</option>
              {opciones.semestres.map((s) => (
                <option key={s} value={s}>Semestre {s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="filtro-riesgo">Nivel de Riesgo</label>
            <select
              id="filtro-riesgo"
              className="form-select"
              value={filtros.nivelRiesgo}
              onChange={(e) => setFiltros({ ...filtros, nivelRiesgo: e.target.value })}
            >
              <option value="">Todos los niveles</option>
              {opciones.nivelesRiesgo.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {hayFiltros
              ? "Los filtros se aplican a la vista previa y a los archivos descargados."
              : "Sin filtros: se exporta la información completa."}
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => setFiltros(FILTROS_INICIALES)} disabled={!hayFiltros}>
            <i className="fas fa-eraser"></i> Limpiar filtros
          </button>
        </div>
      </div>

      {/* ---------------- Tarjetas de descarga ---------------- */}
      <div className="dashboard-grid">
        <div className="card" style={{ gridColumn: "span 4" }}>
          <div style={{ fontSize: "1.5rem", color: "var(--brand-primary)", marginBottom: "0.75rem" }}>
            <i className="fas fa-building-columns"></i>
          </div>
          <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.35rem" }}>Reporte Oficial SNIES / MEN</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            Consolidado de cobertura de caracterización, permanencia y atenciones para el Ministerio de Educación.
          </p>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => exportar("snies")} disabled={descargando === "snies"}>
            <i className="fas fa-download"></i> {descargando === "snies" ? "Generando..." : "Descargar SNIES (CSV)"}
          </button>
          <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setReporteActivo("snies")}>
            <i className="fas fa-eye"></i> Ver vista previa
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
          <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => exportar("intervenciones")} disabled={descargando === "intervenciones"}>
            <i className="fas fa-file-csv"></i> {descargando === "intervenciones" ? "Generando..." : "Exportar Intervenciones"}
          </button>
          <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setReporteActivo("intervenciones")}>
            <i className="fas fa-eye"></i> Ver vista previa
          </button>
        </div>

        <div className="card" style={{ gridColumn: "span 4" }}>
          <div style={{ fontSize: "1.5rem", color: "var(--brand-gold)", marginBottom: "0.75rem" }}>
            <i className="fas fa-share-nodes"></i>
          </div>
          <h3 style={{ fontSize: "1rem", color: "var(--text-main)", marginBottom: "0.35rem" }}>Reporte de Remisiones</h3>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
            Derivaciones canalizadas por la Matriz de Bienestar: tipo de apoyo, servicio, oficina y profesional.
          </p>
          <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => exportar("remisiones")} disabled={descargando === "remisiones"}>
            <i className="fas fa-file-excel"></i> {descargando === "remisiones" ? "Generando..." : "Exportar Remisiones"}
          </button>
          <button className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: "0.5rem" }} onClick={() => setReporteActivo("remisiones")}>
            <i className="fas fa-eye"></i> Ver vista previa
          </button>
        </div>
      </div>

      {/* ---------------- Vista previa ---------------- */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Vista Previa · {REPORTES[reporteActivo].titulo}</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {cargandoPrevia
              ? "Cargando..."
              : `${previa.length} registro${previa.length === 1 ? "" : "s"}${
                  previa.length > FILAS_PREVIA ? ` · se muestran los primeros ${FILAS_PREVIA}` : ""
                }`}
          </span>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                {columnasPrevia.map((c) => (
                  <th key={c.key} style={{ whiteSpace: "nowrap" }}>{c.header.replaceAll("_", " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!cargandoPrevia && previa.length === 0 && (
                <tr>
                  <td colSpan={columnasPrevia.length} className="text-muted" style={{ textAlign: "center" }}>
                    No hay registros que cumplan los filtros seleccionados.
                  </td>
                </tr>
              )}
              {previa.slice(0, FILAS_PREVIA).map((fila, i) => (
                <tr key={fila.idRemision || fila.idIntervencion || fila.codEstudiante || i}>
                  {columnasPrevia.map((c) => (
                    <td key={c.key} style={{ whiteSpace: "nowrap" }}>
                      {filaComoTexto(fila, c, "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          El archivo descargado incluye todos los registros de la lista, no solo los visibles. Se genera en CSV separado
          por punto y coma (;) y codificación UTF-8, de modo que Excel en español lo abre en columnas y con tildes.
        </p>
      </div>
    </AppLayout>
  );
}
