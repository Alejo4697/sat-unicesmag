/* ==========================================================================
   Feature: Seguimiento Estudiantil
   Migración real de ficha-estudiante.html + assets/js/ficha.js: búsqueda
   multicriterio, encabezado del perfil 360°, semaforización por
   dimensiones (calculada de verdad desde puntajesCampo, no "quemada" como
   en el mockup) y la línea de tiempo de intervenciones con la regla de
   confidencialidad VBG (RNF01) ya resuelta por el backend.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { riskBadgeClass, riskBoxStyle } from "../../shared/utils/risk.js";
import { listEstudiantes, getEstudiante, getTimeline } from "./api.js";

const DIMENSION_LABELS = {
  individual: "Individual (IND)",
  asistencial: "Asistencial (INS)",
  academico: "Académico (ACA)",
  socioeconomico: "Socioeconómico (SOC)"
};

export default function FichaEstudiantePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [termino, setTermino] = useState(searchParams.get("codigo") || "202510045");
  const [estudiante, setEstudiante] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarPorCodigo(codigo) {
    setCargando(true);
    setError("");
    try {
      const [est, tl] = await Promise.all([getEstudiante(codigo), getTimeline(codigo)]);
      setEstudiante(est);
      setTimeline(tl);
    } catch (err) {
      setError(err.message);
      setEstudiante(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const codigo = searchParams.get("codigo") || "202510045";
    setTermino(codigo);
    cargarPorCodigo(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function buscar(e) {
    e.preventDefault();
    const q = termino.trim();
    if (!q) return;
    try {
      const resultados = await listEstudiantes(q);
      if (resultados.length === 0) {
        setError("No se encontraron estudiantes con ese criterio de búsqueda.");
        return;
      }
      // Si el término es exactamente un código institucional o una cédula,
      // se prioriza esa coincidencia sobre el primer match por subcadena.
      const exacto = resultados.find((r) => r.codigo === q || r.documento === q);
      setSearchParams({ codigo: (exacto || resultados[0]).codigo });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppLayout titulo="Ficha 360° del Estudiante" breadcrumb="Consulta Integral / Confidencialidad RNF01">
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
          Sugerencias de prueba: <code>202510045</code> o cédula <code>1085324901</code> (Santiago Narváez - Riesgo Alto),{" "}
          <code>202220112</code> (Mateo Solarte - Caso VBG), <code>202410098</code> (Valeria Guerrero)
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {estudiante && !cargando && (
        <>
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
                  <span className={`badge ${riskBadgeClass(estudiante.riesgoGlobal)}`}>
                    <i className="fas fa-circle-exclamation"></i> Riesgo Global {estudiante.riesgoGlobal}
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
                <span className="tag-item">
                  <i className="fas fa-user-group"></i> Acudiente: {estudiante.acudiente.nombre} ({estudiante.acudiente.parentesco}) -{" "}
                  {estudiante.acudiente.telefono}
                </span>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
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

            <div className="card" style={{ gridColumn: "span 8" }}>
              <div className="card-header">
                <h3 className="card-title">Semaforización por Dimensiones (Instrumento de Caracterización)</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center" }}>
                {Object.entries(estudiante.puntajesCampo).map(([key, nivel]) => (
                  <div key={key} style={{ ...riskBoxStyle(nivel), padding: "0.7rem 0.4rem", borderRadius: 6 }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700 }}>{DIMENSION_LABELS[key] || key}</span>
                    <p style={{ fontWeight: 700, margin: "3px 0 0", fontSize: "0.8rem" }}>
                      {nivel} {nivel === "Alto" ? "🔴" : nivel === "Medio" ? "🟠" : "🟢"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Historial de Intervenciones y Procesos de Escucha</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/intervenciones?estudiante=${estudiante.codigo}`} className="btn btn-primary btn-sm">
                  <i className="fas fa-plus"></i> Nueva Intervención
                </Link>
                <Link to={`/remisiones?estudiante=${estudiante.codigo}`} className="btn btn-outline btn-sm">
                  <i className="fas fa-share-nodes"></i> Remitir
                </Link>
              </div>
            </div>

            <div className="timeline">
              {timeline.length === 0 && <p className="page-placeholder">No se registran intervenciones previas para este estudiante.</p>}
              {timeline.map((item) => (
                <div className="timeline-item" key={item.id}>
                  <div className={`timeline-node ${item.esSensibleVBG ? "badge-vbg" : ""}`}></div>
                  <div className="timeline-box">
                    <div className="timeline-top">
                      <span className="timeline-user">
                        {item.atendidoPor} ({item.cargoAtendio})
                      </span>
                      <span className="timeline-time">
                        <i className="far fa-clock"></i> {item.fecha}
                      </span>
                    </div>

                    {item.esSensibleVBG && (
                      <div className="badge badge-risk-high" style={{ marginBottom: 8 }}>
                        <i className="fas fa-lock"></i> Caso Sensible VBG
                      </div>
                    )}

                    {item.detalleVisible ? (
                      <>
                        <p>
                          <strong>Motivo:</strong> {item.motivo}
                        </p>
                        <p style={{ marginTop: 4 }}>
                          <strong>Acuerdos/Compromisos:</strong> {item.resumenAcuerdo}
                        </p>
                        {item.adjuntos.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <small>
                              <strong>Evidencias Adjuntas:</strong>
                            </small>
                            <div>
                              {item.adjuntos.map((a) => (
                                <a
                                  href="#"
                                  key={a.nombre}
                                  onClick={(e) => e.preventDefault()}
                                  className="btn btn-outline btn-sm"
                                  style={{ marginTop: 4, marginRight: 4, display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                  <i className="fas fa-file-pdf" style={{ color: "#A6192E" }}></i> {a.nombre} ({a.tamano})
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="confidential-banner">
                        <i className="fas fa-user-shield confidential-icon"></i>
                        <div>
                          <strong>INFORMACIÓN RESTRINGIDA POR SECRETO PROFESIONAL (RNF01)</strong>
                          <p style={{ fontSize: "0.75rem", margin: 0 }}>
                            El detalle de este caso de VBG está protegido. Solo es accesible para el profesional registrador,
                            Consultorios Jurídicos y USP.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
