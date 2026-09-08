/* ==========================================================================
   Feature: Caracterización
   Migración real de caracterizacion.html + assets/js/caracterizacion.js:
   el instrumento oficial completo (34 ítems en 5 dimensiones), con barra de
   progreso en vivo y el motor de riesgo — que en el mockup corría solo en
   el navegador y nunca se guardaba, y acá corre en el servidor
   (server/src/features/caracterizacion/instrumento.js) y sí persiste cada
   envío (ver MOCK_DATA.caracterizaciones).
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../shared/layout/AppLayout.jsx";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { riskBoxStyle } from "../../shared/utils/risk.js";
import { getInstrumento, enviarCaracterizacion, listEstudiantesParaSelector } from "./api.js";

const DIM_LABELS = {
  IND: "Individual (IND)",
  INS: "Institucional (INS)",
  ACA: "Académico (ACA)",
  SOC: "Socioeconómico (SOC)",
  GEST_PROG: "Gestión Prog"
};

function renderOpciones(item, valor, onChange) {
  const opciones =
    item.tipo === "sino"
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
      <input type="radio" name={`item_${item.id}`} value={op.value} checked={valor === op.value} onChange={() => onChange(item.id, op.value)} required />
      <span>
        {op.icon && <i className={`fas ${op.icon}`}></i>} {op.label}
      </span>
    </label>
  ));
}

export default function CaracterizacionPage() {
  const { user } = useAuth();
  const esEstudiante = user?.rol === "estudiante";

  const [items, setItems] = useState([]);
  const [estudiantes, setEstudiantes] = useState([]);
  const [codigoEstudiante, setCodigoEstudiante] = useState(esEstudiante ? user.codigoEstudiante || "" : "");
  const [respuestas, setRespuestas] = useState({});
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const pedidos = [getInstrumento()];
    if (!esEstudiante) pedidos.push(listEstudiantesParaSelector());
    Promise.all(pedidos)
      .then(([instrumento, listaEstudiantes]) => {
        setItems(instrumento);
        if (listaEstudiantes) setEstudiantes(listaEstudiantes);
      })
      .catch((err) => setError(err.message));
  }, [esEstudiante]);

  const total = items.length;
  const respondidos = Object.keys(respuestas).length;
  const porcentaje = total ? Math.round((respondidos / total) * 100) : 0;

  const grupos = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!map.has(item.dim)) map.set(item.dim, { dim: item.dim, dimNombre: item.dimNombre, items: [] });
      map.get(item.dim).items.push(item);
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
      setError(`Por favor complete los ${total} ítems del instrumento (${respondidos}/${total}).`);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const envio = await enviarCaracterizacion({ codigoEstudiante, respuestas });
      setResultado(envio);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppLayout
      titulo="Formulario Caracterización Permanencia (Instrumento)"
      breadcrumb="Instrumento Institucional / 34 Ítems / Semestres 1, 4 y 7"
    >
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #FFFFFF 0%, var(--surface-subtle) 100%)",
          borderLeft: "4px solid var(--brand-primary)",
          marginBottom: "1.5rem"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 800, color: "var(--brand-primary)", marginBottom: "0.25rem" }}>
              Formulario Caracterización Permanencia
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
              <strong>Número de ítems:</strong> 34 &nbsp;|&nbsp; <strong>Población objetivo:</strong> Aplicado a 1, 4 y 7 semestre
            </p>
          </div>
          <span className="badge badge-risk-low" style={{ fontSize: "0.75rem" }}>
            <i className="fas fa-file-signature"></i> Instrumento Oficial UNICESMAG
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "1rem" }}>
          <span className="tag-item" style={{ background: "#FFF" }}>
            <strong>IND:</strong> 8 ítems a nivel individual
          </span>
          <span className="tag-item" style={{ background: "#FFF" }}>
            <strong>INS:</strong> 7 ítems a nivel institucional
          </span>
          <span className="tag-item" style={{ background: "#FFF" }}>
            <strong>ACA:</strong> 10 ítems a nivel académico
          </span>
          <span className="tag-item" style={{ background: "#FFF" }}>
            <strong>SOC:</strong> 5 ítems a nivel socioeconómico
          </span>
          <span className="tag-item" style={{ background: "#FFF" }}>
            <strong>GEST PROG:</strong> 4 ítems de gestión de permanencia
          </span>
        </div>

        {!esEstudiante && (
          <div className="form-group" style={{ marginTop: "1rem", maxWidth: 420 }}>
            <label className="form-label">Estudiante que diligencia el instrumento</label>
            <select className="form-select" value={codigoEstudiante} onChange={(e) => setCodigoEstudiante(e.target.value)}>
              <option value="">-- Seleccionar estudiante --</option>
              {estudiantes.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.nombres} {e.apellidos} ({e.programa} - Sem. {e.semestre})
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
            <span>Progreso de diligenciamiento</span>
            <span>
              {respondidos} de {total} ítems respondidos ({porcentaje}%)
            </span>
          </div>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${porcentaje}%` }}></div>
          </div>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        {grupos.map((grupo) => (
          <div key={grupo.dim}>
            <div
              style={{
                background: "var(--surface-subtle)",
                borderLeft: "4px solid var(--brand-primary)",
                padding: "0.75rem 1rem",
                margin: "1.5rem 0 1rem",
                borderRadius: 4
              }}
            >
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--brand-primary)", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <i className="fas fa-layer-group"></i> {grupo.dimNombre} ({grupo.dim})
                </span>
                <span className="badge badge-status-process" style={{ fontSize: "0.7rem" }}>
                  {grupo.items.length} ítems
                </span>
              </h4>
            </div>

            {grupo.items.map((item) => (
              <div key={item.id} style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 6, padding: "1rem 1.15rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: "0.75rem" }}>
                  <span style={{ background: "var(--brand-primary)", color: "#FFF", fontWeight: 800, fontSize: "0.75rem", padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
                    {item.id}
                  </span>
                  <p style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--text-main)", margin: 0, lineHeight: 1.4 }}>{item.texto}</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: 32 }}>
                  {renderOpciones(item, respuestas[`item_${item.id}`], responder)}
                </div>
              </div>
            ))}
          </div>
        ))}

        {items.length > 0 && (
          <div
            style={{
              marginTop: "2rem",
              background: "#FFFFFF",
              border: "1px solid var(--border-light)",
              padding: "1.25rem",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "var(--shadow-sm)"
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)" }}>¿Completó todos los ítems?</span>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>Al enviar, el motor evaluará el nivel de riesgo por cada dimensión.</p>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={enviando}>
              <i className="fas fa-paper-plane"></i> {enviando ? "Procesando..." : "Finalizar y Procesar Instrumento"}
            </button>
          </div>
        )}
      </form>

      {resultado && (
        <div className="card" style={{ borderLeft: "5px solid var(--brand-primary)", background: "#FFFFFF", boxShadow: "var(--shadow-md)", marginTop: "1.5rem" }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-square-poll-vertical"></i> Resultado de Evaluación de Caracterización
            </h3>
            <span className={`badge ${resultado.riesgoGlobal === "Alto" ? "badge-risk-high" : resultado.riesgoGlobal === "Medio" ? "badge-risk-medium" : "badge-risk-low"}`}>
              <i className="fas fa-circle-exclamation"></i> Riesgo Global: {resultado.riesgoGlobal} (Índice: {resultado.promedioGlobal} / 4.0)
            </span>
          </div>

          <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
            Se procesaron los <strong>34 ítems</strong> del instrumento institucional para semestres 1, 4 y 7. A continuación se detalla la
            semaforización obtenida en cada dimensión:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, textAlign: "center" }}>
            {Object.entries(resultado.porDimension).map(([dim, val]) => (
              <div key={dim} style={{ ...riskBoxStyle(val.riesgo), padding: "0.75rem 0.5rem", borderRadius: 6 }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 700 }}>{DIM_LABELS[dim] || dim}</span>
                <p style={{ fontWeight: 800, margin: "3px 0 0", fontSize: "0.85rem" }}>
                  {val.riesgo} ({val.promedio})
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              <i className="fas fa-chart-line"></i> Ir al Tablero de Permanencia
            </Link>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
