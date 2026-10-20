/* ==========================================================================
   Feature: Estudiante - EstudiantePortalPage
   Portal Exclusivo de Caracterización Estudiantil SAT-UNICESMAG
   ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { getEstadoEstudiante, getInstrumentoPreguntas, guardarEncuestaEstudiante } from "./api.js";

const DIMENSIONES_CONFIG = {
  IND: { nombre: "Nivel Individual", label: "Individual (IND)", color: "#1e3a8a", bg: "rgba(30, 58, 138, 0.08)", icon: "fa-user" },
  INS: { nombre: "Nivel Institucional", label: "Institucional (INS)", color: "#0891b2", bg: "rgba(8, 145, 178, 0.08)", icon: "fa-building-columns" },
  ACA: { nombre: "Nivel Académico", label: "Académico (ACA)", color: "#2563eb", bg: "rgba(37, 99, 235, 0.08)", icon: "fa-graduation-cap" },
  SOC: { nombre: "Nivel Socioeconómico", label: "Socioeconómico (SOC)", color: "#d97706", bg: "rgba(217, 119, 6, 0.08)", icon: "fa-hand-holding-dollar" },
  GEST_PROG: { nombre: "Gestión de Permanencia del Programa", label: "Gestión Prog (GEST PROG)", color: "#059669", bg: "rgba(5, 150, 105, 0.08)", icon: "fa-users-gear" }
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
    <label
      key={op.value}
      className={`option-pill ${valor === op.value ? "selected" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        borderRadius: "20px",
        cursor: "pointer",
        fontSize: "0.85rem",
        fontWeight: valor === op.value ? "600" : "500",
        background: valor === op.value ? "#002855" : "#f1f5f9",
        color: valor === op.value ? "#ffffff" : "#334155",
        border: valor === op.value ? "1.5px solid #002855" : "1.5px solid #e2e8f0",
        transition: "all 0.2s ease"
      }}
    >
      <input
        type="radio"
        name={`item_${item.id}`}
        value={op.value}
        checked={valor === op.value}
        onChange={() => onChange(item.id, op.value)}
        style={{ display: "none" }}
        required
      />
      {op.icon && <i className={`fas ${op.icon}`}></i>}
      <span>{op.label}</span>
    </label>
  ));
}

export default function EstudiantePortalPage() {
  const { user, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  // Estados del portal
  const [cargando, setCargando] = useState(true);
  const [estadoInfo, setEstadoInfo] = useState(null);
  const [preguntas, setPreguntas] = useState([]);
  const [respuestas, setRespuestas] = useState({});
  const [dimActiva, setDimActiva] = useState("IND");

  // Modal de confirmación, resultado y portafolio
  const [modalConfirmacion, setModalConfirmacion] = useState(false);
  const [modalPortafolio, setModalPortafolio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [comprobanteEnvio, setComprobanteEnvio] = useState(null);
  const [resultadoDiagnostico, setResultadoDiagnostico] = useState(null);
  const [error, setError] = useState("");

  // Cargar estado del estudiante e instrumento actualizado
  useEffect(() => {
    async function init() {
      setCargando(true);
      setError("");
      try {
        const [estData, pregData] = await Promise.all([
          getEstadoEstudiante(),
          getInstrumentoPreguntas()
        ]);
        setEstadoInfo(estData);
        setPreguntas(pregData || []);
        if (estData.encuestaCompletada) {
          setComprobanteEnvio({
            id: estData.idRespuesta || "CAR-REGISTRADA",
            fecha: estData.fechaCompletado,
            semestre: estData.estudiante?.semestre
          });
          if (estData.resultado) {
            setResultadoDiagnostico(estData.resultado);
          }
        }
      } catch (err) {
        setError(err.message || "No se pudo cargar la información del estudiante.");
      } finally {
        setCargando(false);
      }
    }
    init();
  }, []);

  // Agrupar preguntas por dimensión
  const dimensiones = useMemo(() => {
    const map = new Map();
    preguntas.forEach((p) => {
      const dimKey = p.dim || p.categoria || "IND";
      if (!map.has(dimKey)) {
        map.set(dimKey, {
          dim: dimKey,
          config: DIMENSIONES_CONFIG[dimKey] || DIMENSIONES_CONFIG.IND,
          items: []
        });
      }
      map.get(dimKey).items.push(p);
    });
    return Array.from(map.values());
  }, [preguntas]);

  // Asegurar que dimActiva apunte a la primera dimensión con preguntas si cambia la lista
  useEffect(() => {
    if (dimensiones.length > 0 && !dimensiones.some((d) => d.dim === dimActiva)) {
      setDimActiva(dimensiones[0].dim);
    }
  }, [dimensiones, dimActiva]);

  // Contadores de progreso
  const totalPreguntas = preguntas.length;
  const respondidasCount = Object.keys(respuestas).length;
  const porcentajeAvance = totalPreguntas > 0 ? Math.round((respondidasCount / totalPreguntas) * 100) : 0;

  function handleResponder(itemId, valor) {
    setRespuestas((prev) => ({
      ...prev,
      [`item_${itemId}`]: valor
    }));
  }

  // Dimensiones disponibles dinámicamente
  const dimsList = useMemo(() => dimensiones.map((d) => d.dim), [dimensiones]);
  const dimIdxActual = dimsList.indexOf(dimActiva);

  function cambiarDimension(siguiente = true) {
    if (siguiente && dimIdxActual < dimsList.length - 1) {
      setDimActiva(dimsList[dimIdxActual + 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (!siguiente && dimIdxActual > 0) {
      setDimActiva(dimsList[dimIdxActual - 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Abrir modal de confirmación
  function handleSolicitarConfirmacion(e) {
    e.preventDefault();
    if (respondidasCount < totalPreguntas) {
      setError(`Debes responder todas las ${totalPreguntas} preguntas para poder enviar (${respondidasCount}/${totalPreguntas} respondidas).`);
      return;
    }
    setError("");
    setModalConfirmacion(true);
  }

  // Enviar respuestas definitivas
  async function handleConfirmarEnvio() {
    setEnviando(true);
    setError("");
    try {
      const res = await guardarEncuestaEstudiante({ respuestas });
      setComprobanteEnvio(res.comprobante);
      if (res.resultado) {
        setResultadoDiagnostico(res.resultado);
      }
      setModalConfirmacion(false);
      setEstadoInfo((prev) => ({ ...prev, encuestaCompletada: true }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Ocurrió un error al registrar las respuestas.");
      setModalConfirmacion(false);
    } finally {
      setEnviando(false);
    }
  }

  function handleLogout() {
    cerrarSesion();
    navigate("/estudiante/login", { replace: true });
  }

  if (cargando) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <i className="fas fa-spinner fa-spin fa-2x" style={{ color: "var(--brand-primary)" }}></i>
          <p style={{ marginTop: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>Cargando portal estudiantil...</p>
        </div>
      </div>
    );
  }

  const est = estadoInfo?.estudiante || user;
  const esElegible = estadoInfo?.esElegible;
  const encuestaYaCompletada = estadoInfo?.encuestaCompletada || !!comprobanteEnvio;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar Estudiantil */}
      <header
        style={{
          background: "#002855",
          color: "#ffffff",
          padding: "0.75rem 1.5rem",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
          flexWrap: "wrap",
          gap: "0.75rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src="/img/escudo_unicesmag.png"
            alt="Escudo UNICESMAG"
            style={{ height: "40px", width: "auto" }}
          />
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: "700", letterSpacing: "0.5px" }}>UNIVERSIDAD CESMAG</div>
            <div style={{ fontSize: "0.75rem", color: "#93c5fd" }}>Portal de Caracterización Estudiantil</div>
          </div>
        </div>

        {/* Info del Estudiante Autenticado */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: "600" }}>{est?.nombreCompleto || est?.nombre}</div>
            <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
              Cód. {est?.codigo || est?.codigoEstudiante} • Semestre {est?.semestre}
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#ffffff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "background 0.2s"
            }}
            title="Cerrar Sesión Segura"
          >
            <i className="fas fa-arrow-right-from-bracket"></i>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main style={{ flex: 1, maxWidth: "1000px", width: "100%", margin: "0 auto", padding: "1.5rem 1rem" }}>
        {/* Banner de Bienvenida y Datos del Alumno */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem"
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: 0, color: "#002855", fontWeight: "700" }}>
              Bienvenido(a), {est?.nombres || est?.nombre}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.875rem" }}>
              {est?.programa || "Programa Académico"} • Documento: {est?.documento || est?.numeroDocumento}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span
              style={{
                background: "#eff6ff",
                color: "#1d4ed8",
                padding: "6px 12px",
                borderRadius: "20px",
                fontSize: "0.8rem",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <i className="fas fa-layer-group"></i> Semestre {est?.semestre}
            </span>
            <span
              style={{
                background: "#f0fdf4",
                color: "#15803d",
                padding: "6px 12px",
                borderRadius: "20px",
                fontSize: "0.8rem",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <i className="fas fa-calendar-check"></i> Periodo {estadoInfo?.periodoActivo?.nombre || "2026-1"}
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              borderLeft: "4px solid #ef4444",
              color: "#991b1b",
              padding: "12px 16px",
              borderRadius: "0 8px 8px 0",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <i className="fas fa-triangle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {/* CASO 1: NO ELEGIBLE (Semestre no es 1, 4 o 7) */}
        {!esElegible && (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "3rem 2rem",
              textAlign: "center",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.75rem",
                margin: "0 auto 1.5rem"
              }}
            >
              <i className="fas fa-circle-info"></i>
            </div>
            <h3 style={{ fontSize: "1.35rem", color: "#002855", fontWeight: "700", marginBottom: "0.75rem" }}>
              Encuesta no requerida para tu semestre actual
            </h3>
            <p style={{ color: "#475569", maxWidth: "540px", margin: "0 auto 1.5rem", lineHeight: "1.6", fontSize: "0.95rem" }}>
              Actualmente estás matriculado en <strong>Semestre {est?.semestre}</strong>. El proceso institucional de
              caracterización y permanencia estudiantil en este ciclo está habilitado exclusivamente para estudiantes de{" "}
              <strong>1.º, 4.º y 7.º semestre</strong>.
            </p>
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "1rem",
                maxWidth: "480px",
                margin: "0 auto 2rem",
                fontSize: "0.825rem",
                color: "#64748b"
              }}
            >
              <i className="fas fa-shield-halved" style={{ color: "#059669", marginRight: "6px" }}></i>
              Tu registro se encuentra al día en el Sistema de Acompañamiento y Permanencia Estudiantil.
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: "#002855",
                color: "#ffffff",
                border: "none",
                padding: "10px 24px",
                borderRadius: "8px",
                fontWeight: "600",
                cursor: "pointer",
                fontSize: "0.9rem"
              }}
            >
              Finalizar y Salir
            </button>
          </div>
        )}

        {/* CASO 2: ENCUESTA COMPLETADA — MOSTRAR RESULTADO ACTUALIZADO DE CARACTERIZACIÓN ESTUDIANTIL */}
        {esElegible && encuestaYaCompletada && (
          <div
            style={{
              padding: "2.5rem 2rem",
              background: "#FFFFFF",
              borderRadius: "14px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              border: "1px solid #e2e8f0"
            }}
          >
            {/* Encabezado Principal */}
            <h1
              style={{
                color: "#D97706",
                fontSize: "1.55rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                textAlign: "center",
                margin: "0 0 1.25rem 0",
                textTransform: "uppercase"
              }}
            >
              CARACTERIZACIÓN ESTUDIANTIL
            </h1>

            {/* Párrafo de Agradecimiento e Introducción */}
            <p
              style={{
                textAlign: "center",
                maxWidth: "860px",
                margin: "0 auto 1.25rem auto",
                fontSize: "0.95rem",
                color: "#374151",
                lineHeight: "1.55"
              }}
            >
              Gracias por participar en el proceso de caracterización estudiantil. Esta evaluación nos permite conocer mejor tu experiencia universitaria y brindarte el acompañamiento necesario para potenciar tu desarrollo académico y personal.
            </p>

            {resultadoDiagnostico ? (
              <>
                {/* Mensaje de Clasificación */}
                <p
                  style={{
                    textAlign: "center",
                    fontSize: "0.95rem",
                    color: "#1F2937",
                    margin: "0 0 1.5rem 0",
                    fontWeight: 500
                  }}
                >
                  Según la información que proporcionaste, tu nivel de permanencia en la universidad ha sido clasificado como:
                </p>

                {/* Bloque: NIVEL DE PERMANENCIA */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      border: "2px solid #000000",
                      borderRadius: "3px",
                      overflow: "hidden",
                      background: "#FFFFFF",
                      flexWrap: "wrap"
                    }}
                  >
                    <div
                      style={{
                        padding: "0.6rem 2rem",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        letterSpacing: "0.03em",
                        borderRight: "2px solid #000000",
                        background: "#FFFFFF",
                        color: "#000000",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      NIVEL DE PERMANENCIA
                    </div>
                    <div
                      style={{
                        padding: "0.6rem 2.5rem",
                        fontWeight: 900,
                        fontSize: "1.1rem",
                        color:
                          resultadoDiagnostico.nivelPermanencia === "Baja"
                            ? "#DC2626"
                            : resultadoDiagnostico.nivelPermanencia === "Media"
                            ? "#D97706"
                            : "#059669",
                        background: "#FFFFFF",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      {resultadoDiagnostico.nivelPermanencia}
                    </div>
                  </div>
                </div>

                {/* Tabla Diagnóstica de 4 Columnas por Dimensión */}
                <div style={{ overflowX: "auto", marginBottom: "2.25rem" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      border: "1px solid #D1D5DB",
                      minWidth: "640px"
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            resultadoDiagnostico.nivelPermanencia === "Baja"
                              ? "#FDE8E8"
                              : resultadoDiagnostico.nivelPermanencia === "Media"
                              ? "#FEF3C7"
                              : "#DCFCE7"
                        }}
                      >
                        <th
                          style={{
                            padding: "0.85rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            textAlign: "center",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#111827",
                            width: "25%"
                          }}
                        >
                          Nivel Individual
                        </th>
                        <th
                          style={{
                            padding: "0.85rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            textAlign: "center",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#111827",
                            width: "25%"
                          }}
                        >
                          Nivel Institucional
                        </th>
                        <th
                          style={{
                            padding: "0.85rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            textAlign: "center",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#111827",
                            width: "25%"
                          }}
                        >
                          Nivel Académico
                        </th>
                        <th
                          style={{
                            padding: "0.85rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            textAlign: "center",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#111827",
                            width: "25%"
                          }}
                        >
                          Nivel Socioeconómico
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          style={{
                            padding: "1.1rem 0.9rem",
                            border: "1px solid #D1D5DB",
                            fontSize: "0.865rem",
                            color: "#1F2937",
                            verticalAlign: "top",
                            lineHeight: "1.5",
                            background: "#FFFFFF",
                            textAlign: "left"
                          }}
                        >
                          {resultadoDiagnostico.conceptosPorDimension?.IND}
                        </td>
                        <td
                          style={{
                            padding: "1.1rem 0.9rem",
                            border: "1px solid #D1D5DB",
                            fontSize: "0.865rem",
                            color: "#1F2937",
                            verticalAlign: "top",
                            lineHeight: "1.5",
                            background: "#FFFFFF",
                            textAlign: "left"
                          }}
                        >
                          {resultadoDiagnostico.conceptosPorDimension?.INS}
                        </td>
                        <td
                          style={{
                            padding: "1.1rem 0.9rem",
                            border: "1px solid #D1D5DB",
                            fontSize: "0.865rem",
                            color: "#1F2937",
                            verticalAlign: "top",
                            lineHeight: "1.5",
                            background: "#FFFFFF",
                            textAlign: "left"
                          }}
                        >
                          {resultadoDiagnostico.conceptosPorDimension?.ACA}
                        </td>
                        <td
                          style={{
                            padding: "1.1rem 0.9rem",
                            border: "1px solid #D1D5DB",
                            fontSize: "0.865rem",
                            color: "#1F2937",
                            verticalAlign: "top",
                            lineHeight: "1.5",
                            background: "#FFFFFF",
                            textAlign: "left"
                          }}
                        >
                          {resultadoDiagnostico.conceptosPorDimension?.SOC}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Tarjeta Enmarcada: ¡INFORMACIÓN IMPORTANTE! */}
                <div
                  style={{
                    border: "1.5px solid #111827",
                    borderRadius: "14px",
                    padding: "2rem 1.75rem",
                    background: "#FFFFFF",
                    marginBottom: "1.75rem",
                    textAlign: "center"
                  }}
                >
                  <h2
                    style={{
                      fontSize: "1.85rem",
                      fontWeight: 900,
                      fontStyle: "italic",
                      letterSpacing: "0.02em",
                      margin: "0 0 0.85rem 0",
                      color: "#000000"
                    }}
                  >
                    {resultadoDiagnostico.mensajePermanencia?.titulo || "¡INFORMACIÓN IMPORTANTE!"}
                  </h2>

                  <p
                    style={{
                      fontSize: "1.1rem",
                      fontStyle: "italic",
                      fontWeight: 800,
                      margin: "0 0 1.25rem 0",
                      color: "#000000"
                    }}
                  >
                    {resultadoDiagnostico.mensajePermanencia?.subtitulo ||
                      `Tu nivel de permanencia en la universidad es ${(resultadoDiagnostico.nivelPermanencia || "Media").toUpperCase()}.`}
                  </p>

                  <div
                    style={{
                      maxWidth: "840px",
                      margin: "0 auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.15rem",
                      fontStyle: "italic",
                      fontSize: "1rem",
                      color: "#1F2937",
                      lineHeight: "1.6"
                    }}
                  >
                    <p style={{ margin: 0 }}>{resultadoDiagnostico.mensajePermanencia?.parrafo1}</p>
                    <p style={{ margin: 0 }}>{resultadoDiagnostico.mensajePermanencia?.parrafo2}</p>
                    <p style={{ margin: 0 }}>{resultadoDiagnostico.mensajePermanencia?.parrafo3}</p>
                  </div>
                </div>

                {/* Mensaje de Cierre y Contacto */}
                <p
                  style={{
                    textAlign: "center",
                    fontSize: "0.85rem",
                    color: "#4B5563",
                    maxWidth: "840px",
                    margin: "0 auto 1.25rem auto",
                    lineHeight: "1.45"
                  }}
                >
                  Si deseas conversar sobre tu resultado o recibir orientación, no dudes en contactarnos. Nuestro compromiso es acompañarte en este camino y asegurarnos de que cuentes con las herramientas necesarias para alcanzar tus metas.
                </p>

                {/* Docente Acompañante */}
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#111827" }}>
                    Docente Acompañante:{" "}
                  </span>
                  <span style={{ fontSize: "1.05rem", fontWeight: 500, color: "#374151" }}>
                    {resultadoDiagnostico.docenteAcompanante || "Equipo de Permanencia y Acompañamiento Institucional"}
                  </span>
                </div>
              </>
            ) : null}

            {/* Ficha de Comprobante Oficial */}
            <div
              style={{
                background: "#f8fafc",
                border: "2px dashed #cbd5e1",
                borderRadius: "10px",
                padding: "1.1rem 1.5rem",
                maxWidth: "520px",
                margin: "0 auto 1.75rem",
                textAlign: "left"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>Código Comprobante:</span>
                <strong style={{ color: "#002855", fontFamily: "monospace" }}>{comprobanteEnvio?.id || "CAR-2026-OK"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>Estudiante:</span>
                <strong style={{ color: "#1e293b" }}>{est?.nombres} {est?.apellidos}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>Documento:</span>
                <strong style={{ color: "#1e293b" }}>{est?.documento || est?.numeroDocumento}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: "#64748b" }}>Fecha de Registro:</span>
                <strong style={{ color: "#1e293b" }}>{comprobanteEnvio?.fecha || new Date().toISOString().substring(0, 10)}</strong>
              </div>
            </div>

            {/* Botones de Acción */}
            <div style={{ display: "flex", justifyContent: "center", gap: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setModalPortafolio(true)}
                style={{
                  backgroundColor: "#1E3A8A",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 24px",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.15)"
                }}
              >
                PORTAFOLIO DE SERVICIOS
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: "#ffffff",
                  color: "#1e293b",
                  border: "1.5px solid #cbd5e1",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <i className="fas fa-print"></i> Imprimir Comprobante
              </button>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: "#059669",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 24px",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <i className="fas fa-check"></i> Finalizar y Cerrar Sesión
              </button>
            </div>
          </div>
        )}

        {/* CASO 3: FORMULARIO DE CARACTERIZACIÓN ACTIVO */}
        {esElegible && !encuestaYaCompletada && (
          <div>
            {/* Barra de Progreso Global */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "1rem 1.5rem",
                marginBottom: "1.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "#002855" }}>
                  Progreso del Instrumento ({respondidasCount} de {totalPreguntas} preguntas)
                </span>
                <span style={{ fontSize: "0.9rem", fontWeight: "700", color: porcentajeAvance === 100 ? "#059669" : "#2563eb" }}>
                  {porcentajeAvance}%
                </span>
              </div>
              <div style={{ height: "10px", background: "#e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${porcentajeAvance}%`,
                    background: porcentajeAvance === 100 ? "#059669" : "linear-gradient(90deg, #2563eb, #059669)",
                    transition: "width 0.3s ease"
                  }}
                ></div>
              </div>
            </div>

            {/* Pestañas de Navegación por Dimensión */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                overflowX: "auto",
                paddingBottom: "8px",
                marginBottom: "1.5rem"
              }}
            >
              {dimensiones.map((d) => {
                const isActive = dimActiva === d.dim;
                const dimItems = d.items;
                const respEnDim = dimItems.filter((it) => respuestas[`item_${it.id}`] !== undefined).length;
                const dimCompleta = respEnDim === dimItems.length && dimItems.length > 0;

                return (
                  <button
                    key={d.dim}
                    type="button"
                    onClick={() => setDimActiva(d.dim)}
                    style={{
                      flex: "1 0 auto",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: isActive ? `2px solid ${d.config.color}` : "1.5px solid #e2e8f0",
                      background: isActive ? d.config.bg : "#ffffff",
                      color: isActive ? d.config.color : "#475569",
                      fontWeight: isActive ? "700" : "500",
                      cursor: "pointer",
                      fontSize: "0.825rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      transition: "all 0.2s"
                    }}
                  >
                    <i className={`fas ${d.config.icon}`} style={{ color: d.config.color }}></i>
                    <span>{d.config.label}</span>
                    {dimCompleta ? (
                      <i className="fas fa-check-circle" style={{ color: "#059669", marginLeft: "auto" }}></i>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          background: isActive ? d.config.color : "#cbd5e1",
                          color: "#ffffff",
                          padding: "2px 6px",
                          borderRadius: "10px",
                          marginLeft: "auto"
                        }}
                      >
                        {respEnDim}/{dimItems.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Formulario de Preguntas de la Dimensión Seleccionada */}
            <form onSubmit={handleSolicitarConfirmacion}>
              {dimensiones
                .filter((d) => d.dim === dimActiva)
                .map((d) => (
                  <div key={d.dim} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div
                      style={{
                        background: d.config.bg,
                        borderLeft: `4px solid ${d.config.color}`,
                        padding: "12px 16px",
                        borderRadius: "0 8px 8px 0",
                        marginBottom: "0.5rem"
                      }}
                    >
                      <h4 style={{ margin: 0, color: d.config.color, fontSize: "1rem", fontWeight: "700" }}>
                        {d.config.nombre}
                      </h4>
                      <p style={{ margin: "4px 0 0", color: "#475569", fontSize: "0.825rem" }}>
                        Selecciona la opción que mejor refleje tu situación o percepción personal.
                      </p>
                    </div>

                    {d.items.map((item) => {
                      const valorActual = respuestas[`item_${item.id}`];
                      return (
                        <div
                          key={item.id}
                          style={{
                            background: "#ffffff",
                            borderRadius: "10px",
                            padding: "1.25rem 1.5rem",
                            border: valorActual !== undefined ? "1.5px solid #cbd5e1" : "1.5px solid #fecaca",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                            transition: "border-color 0.2s"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "1rem" }}>
                            <span
                              style={{
                                background: d.config.color,
                                color: "#ffffff",
                                width: "26px",
                                height: "26px",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.75rem",
                                fontWeight: "700",
                                flexShrink: 0
                              }}
                            >
                              {item.orden || item.id}
                            </span>
                            <p style={{ margin: 0, fontSize: "0.95rem", color: "#1e293b", fontWeight: "500", lineHeight: "1.5" }}>
                              {item.texto}
                            </p>
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginLeft: "36px" }}>
                            {renderOpciones(item, valorActual, handleResponder)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

              {/* Botones de Navegación entre Dimensiones */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "2rem",
                  padding: "1rem 0",
                  flexWrap: "wrap",
                  gap: "0.75rem"
                }}
              >
                <button
                  type="button"
                  onClick={() => cambiarDimension(false)}
                  disabled={dimIdxActual <= 0}
                  style={{
                    background: "#ffffff",
                    border: "1.5px solid #cbd5e1",
                    color: dimIdxActual <= 0 ? "#94a3b8" : "#334155",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    fontWeight: "600",
                    cursor: dimIdxActual <= 0 ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <i className="fas fa-arrow-left"></i> Dimensión Anterior
                </button>

                {dimIdxActual < dimsList.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => cambiarDimension(true)}
                    style={{
                      background: "#002855",
                      border: "none",
                      color: "#ffffff",
                      padding: "10px 20px",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <span>Siguiente Dimensión</span>
                    <i className="fas fa-arrow-right"></i>
                  </button>
                ) : (
                  <button
                    type="submit"
                    style={{
                      background: respondidasCount === totalPreguntas ? "#059669" : "#64748b",
                      border: "none",
                      color: "#ffffff",
                      padding: "12px 24px",
                      borderRadius: "8px",
                      fontWeight: "700",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)"
                    }}
                  >
                    <i className="fas fa-paper-plane"></i>
                    <span>Revisar y Enviar Encuesta</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </main>

      {/* MODAL DE CONFIRMACIÓN PREVIO AL ENVÍO */}
      {modalConfirmacion && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem"
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              maxWidth: "500px",
              width: "100%",
              padding: "2rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              textAlign: "center"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(5, 150, 105, 0.1)",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                margin: "0 auto 1rem"
              }}
            >
              <i className="fas fa-clipboard-check"></i>
            </div>

            <h3 style={{ fontSize: "1.25rem", color: "#002855", fontWeight: "700", marginBottom: "0.75rem" }}>
              ¿Confirmas el envío de tu caracterización?
            </h3>

            <p style={{ color: "#475569", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "1.5rem" }}>
              Has completado las <strong>{totalPreguntas} preguntas</strong> del instrumento institucional. Una vez
              confirmado el envío, tus respuestas quedarán registradas de manera oficial para el periodo{" "}
              <strong>{estadoInfo?.periodoActivo?.nombre || "2026-1"}</strong> y visualizarás de inmediato tu resultado de caracterización.
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setModalConfirmacion(false)}
                disabled={enviando}
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "0.875rem"
                }}
              >
                Volver a Revisar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEnvio}
                disabled={enviando}
                style={{
                  background: "#059669",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 22px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  cursor: enviando ? "wait" : "pointer",
                  fontSize: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {enviando ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-check"></i>
                    <span>Sí, Confirmar y Guardar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PORTAFOLIO DE SERVICIOS INSTITUCIONALES UNICESMAG */}
      {modalPortafolio && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "1rem"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "750px",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#FFFFFF",
              borderRadius: "14px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              padding: "2rem"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#002855" }}>
                  Portafolio de Servicios de Permanencia y Bienestar
                </h3>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Universidad CESMAG — Acompañamiento Integral al Estudiante
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalPortafolio(false)}
                style={{ background: "none", border: "none", fontSize: "1.25rem", color: "#64748b", cursor: "pointer" }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <i className="fas fa-brain" style={{ color: "#2563EB", fontSize: "1.1rem" }}></i>
                  <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Unidad de Servicios Psicológicos (USP)</strong>
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "#475569" }}>
                  Atención psicológica individual, orientación emocional, talleres de manejo de ansiedad y técnicas de adaptación a la vida universitaria.
                </p>
                <span style={{ fontSize: "0.8rem", color: "#2563EB", fontWeight: 600 }}>
                  <i className="fas fa-envelope"></i> usp@unicesmag.edu.co | Ext. 145 - Edificio San Francisco
                </span>
              </div>

              <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <i className="fas fa-chalkboard-user" style={{ color: "#059669", fontSize: "1.1rem" }}></i>
                  <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Tutorías Académicas y Refuerzo Docente</strong>
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "#475569" }}>
                  Acompañamiento personalizado en asignaturas de alta exigencia, métodos de estudio, razonamiento lógico y lectoescritura.
                </p>
                <span style={{ fontSize: "0.8rem", color: "#059669", fontWeight: 600 }}>
                  <i className="fas fa-user-check"></i> Consulta con tu Director de Programa o Coordinación Académica
                </span>
              </div>

              <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <i className="fas fa-hand-holding-dollar" style={{ color: "#D97706", fontSize: "1.1rem" }}></i>
                  <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Trabajo Social y Apoyos Socioeconómicos</strong>
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "#475569" }}>
                  Orientación sobre convenios de financiamiento, becas por rendimiento, subsidios de alimentación y monitorías institucionales.
                </p>
                <span style={{ fontSize: "0.8rem", color: "#D97706", fontWeight: 600 }}>
                  <i className="fas fa-envelope"></i> trabajosocial@unicesmag.edu.co | Bienestar Institucional
                </span>
              </div>

              <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <i className="fas fa-scale-balanced" style={{ color: "#7C3AED", fontSize: "1.1rem" }}></i>
                  <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Consultorios Jurídicos y Centro de Conciliación</strong>
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "#475569" }}>
                  Asesoría legal confidencial y canal de atención especializada en prevención y protección ante Violencia Basada en Género (VBG).
                </p>
                <span style={{ fontSize: "0.8rem", color: "#7C3AED", fontWeight: 600 }}>
                  <i className="fas fa-shield-halved"></i> consultoriosjuridicos@unicesmag.edu.co
                </span>
              </div>

              <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
                  <i className="fas fa-heart-pulse" style={{ color: "#EF4444", fontSize: "1.1rem" }}></i>
                  <strong style={{ fontSize: "1rem", color: "#1e293b" }}>Área de Salud María Goretti y Pastoral Universitaria</strong>
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", color: "#475569" }}>
                  Primeros auxilios, valoración de salud general, enfermería, actividades de formación integral y bienestar espiritual.
                </p>
                <span style={{ fontSize: "0.8rem", color: "#EF4444", fontWeight: 600 }}>
                  <i className="fas fa-phone"></i> PBX: (2) 724 4434 - Área de Salud
                </span>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setModalPortafolio(false)}
                style={{
                  background: "#002855",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 24px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Institucional */}
      <footer style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        © {new Date().getFullYear()} Universidad CESMAG — Sistema de Alertas Tempranas y Permanencia Estudiantil (SAT)
      </footer>
    </div>
  );
}
