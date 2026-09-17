/* ==========================================================================
   Feature: Estudiante - EstudianteLoginPage
   Portal de Acceso Exclusivo para Estudiantes (Autenticación OTP sin contraseña)
   ========================================================================== */

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { solicitarOtp, verificarOtp } from "./api.js";

export default function EstudianteLoginPage() {
  const { user, iniciarSesionComo } = useAuth();
  const navigate = useNavigate();

  // Paso 1: 'solicitud' | Paso 2: 'verificacion'
  const [paso, setPaso] = useState("solicitud");

  // Formulario Solicitud
  const [documento, setDocumento] = useState("");
  const [correo, setCorreo] = useState("");

  // Formulario Verificación OTP
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [correoOfuscado, setCorreoOfuscado] = useState("");
  const [segundosRestantes, setSegundosRestantes] = useState(900); // 15 min (900 seg)
  const [codigoDev, setCodigoDev] = useState("");

  // Estados UI
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // Refs para los 6 inputs del OTP
  const inputRefs = useRef([]);

  useEffect(() => {
    if (user?.rol === "estudiante") {
      navigate("/estudiante/portal", { replace: true });
    } else if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // Temporizador regresivo para el código OTP
  useEffect(() => {
    if (paso !== "verificacion" || segundosRestantes <= 0) return;

    const timer = setInterval(() => {
      setSegundosRestantes((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [paso, segundosRestantes]);

  // Formatear segundos a MM:SS
  const tiempoFormateado = `${String(Math.floor(segundosRestantes / 60)).padStart(2, "0")}:${String(
    segundosRestantes % 60
  ).padStart(2, "0")}`;

  // 1. Manejar Solicitud de OTP
  async function handleSolicitar(e) {
    e.preventDefault();
    setError("");
    setMensajeExito("");

    if (!documento.trim() || !correo.trim()) {
      setError("Por favor ingrese su número de documento y correo institucional.");
      return;
    }

    if (!correo.includes("@")) {
      setError("Ingrese una dirección de correo institucional válida.");
      return;
    }

    setCargando(true);
    try {
      const resp = await solicitarOtp({
        documento: documento.trim(),
        correo: correo.trim()
      });

      setCorreoOfuscado(resp.correoOfuscado || correo.trim());
      setSegundosRestantes((resp.expiraMinutos || 15) * 60);
      if (resp.codigoDev) setCodigoDev(resp.codigoDev);
      setPaso("verificacion");
      setMensajeExito(resp.mensaje || "Código de verificación enviado.");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.message || "No se pudo solicitar el código de verificación.");
    } finally {
      setCargando(false);
    }
  }

  // 2. Manejar Cambio en Casillas de OTP
  function handleOtpChange(index, value) {
    if (value.length > 1) {
      // Manejar pegado de código completo
      const cleaned = value.replace(/\D/g, "").slice(0, 6);
      if (cleaned.length > 0) {
        const newDigits = [...otpDigits];
        for (let i = 0; i < cleaned.length; i++) {
          newDigits[i] = cleaned[i];
        }
        setOtpDigits(newDigits);
        const nextFocus = Math.min(cleaned.length, 5);
        inputRefs.current[nextFocus]?.focus();
      }
      return;
    }

    const cleanChar = value.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = cleanChar;
    setOtpDigits(newDigits);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  // 3. Manejar Verificación de OTP
  async function handleVerificar(e) {
    e.preventDefault();
    setError("");
    const codigoCompleto = otpDigits.join("");

    if (codigoCompleto.length < 6) {
      setError("Por favor complete los 6 dígitos del código de verificación.");
      return;
    }

    if (segundosRestantes <= 0) {
      setError("El código de verificación ha expirado. Por favor solicite uno nuevo.");
      return;
    }

    setCargando(true);
    try {
      const resp = await verificarOtp({
        documento: documento.trim(),
        correo: correo.trim(),
        codigo: codigoCompleto
      });

      iniciarSesionComo(resp.usuario);
      navigate("/estudiante/portal");
    } catch (err) {
      setError(err.message || "Código inválido o expirado.");
    } finally {
      setCargando(false);
    }
  }

  // Reenviar OTP
  async function handleReenviar() {
    setError("");
    setMensajeExito("");
    setCargando(true);
    try {
      const resp = await solicitarOtp({
        documento: documento.trim(),
        correo: correo.trim()
      });
      setSegundosRestantes((resp.expiraMinutos || 15) * 60);
      setOtpDigits(["", "", "", "", "", ""]);
      if (resp.codigoDev) setCodigoDev(resp.codigoDev);
      setMensajeExito("Nuevo código de verificación enviado.");
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || "No se pudo reenviar el código.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-top-bar"></div>

      <div className="login-container">
        <div className="login-card" style={{ maxWidth: 480 }}>
          {/* Encabezado Institucional */}
          <div className="login-header">
            <div className="login-logo-container">
              <img
                src="/img/escudo_unicesmag.png"
                alt="Escudo Universidad CESMAG"
                className="login-escudo"
              />
            </div>
            <div className="login-inst-badge" style={{ background: "rgba(5, 150, 105, 0.12)", color: "#059669" }}>
              PORTAL ESTUDIANTIL
            </div>
            <h1 className="login-title">Caracterización Estudiantil</h1>
            <p className="login-subtitle">
              Acceso seguro sin contraseña mediante código temporal de verificación (OTP)
            </p>
          </div>

          {/* Notificaciones de Error o Éxito */}
          {error && (
            <div className="login-error-alert" style={{ marginBottom: "1rem" }}>
              <i className="fas fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          {mensajeExito && (
            <div
              style={{
                background: "rgba(5, 150, 105, 0.1)",
                border: "1px solid rgba(5, 150, 105, 0.3)",
                color: "#047857",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "1rem"
              }}
            >
              <i className="fas fa-circle-check"></i>
              <span>{mensajeExito}</span>
            </div>
          )}

          {/* Banner de código temporal provisional */}
          {codigoDev && paso === "verificacion" && (
            <div
              style={{
                background: "#fef3c7",
                border: "1.5px dashed #f59e0b",
                color: "#92400e",
                padding: "12px 14px",
                borderRadius: "8px",
                fontSize: "0.875rem",
                marginBottom: "1.25rem",
                textAlign: "center"
              }}
            >
              <div>
                <i className="fas fa-key" style={{ marginRight: "6px" }}></i>
                Código de acceso generado (provisional):{" "}
                <strong style={{ fontSize: "1.15rem", letterSpacing: "2px", color: "#b45309" }}>{codigoDev}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtpDigits(codigoDev.split(""));
                }}
                style={{
                  marginTop: "8px",
                  background: "#b45309",
                  color: "#ffffff",
                  border: "none",
                  padding: "4px 12px",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                <i className="fas fa-paste"></i> Autocompletar en las casillas
              </button>
            </div>
          )}

          {/* PASO 1: Ingreso de Cédula y Correo Institucional */}


          {paso === "solicitud" && (
            <form onSubmit={handleSolicitar} className="login-form">
              <div className="login-form-group">
                <label htmlFor="est-doc" className="login-label">
                  <i className="fas fa-id-card" style={{ color: "var(--brand-primary)" }}></i>
                  Número de Cédula o Documento de Identidad
                </label>
                <div className="login-input-wrapper">
                  <i className="fas fa-fingerprint login-input-icon"></i>
                  <input
                    id="est-doc"
                    type="text"
                    className="login-input"
                    placeholder="Ej. 1085001009"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="login-form-group">
                <label htmlFor="est-email" className="login-label">
                  <i className="fas fa-envelope" style={{ color: "var(--brand-primary)" }}></i>
                  Correo Electrónico Institucional
                </label>
                <div className="login-input-wrapper">
                  <i className="fas fa-at login-input-icon"></i>
                  <input
                    id="est-email"
                    type="email"
                    className="login-input"
                    placeholder="ejemplo@unicesmag.edu.co"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    required
                  />
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                  Enviaremos un código numérico temporal de 6 dígitos a tu bandeja de correo.
                </span>
              </div>

              <button type="submit" className="login-btn-submit" disabled={cargando} style={{ background: "#059669" }}>
                {cargando ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Verificando datos...</span>
                  </>
                ) : (
                  <>
                    <span>Solicitar Código de Acceso</span>
                    <i className="fas fa-paper-plane"></i>
                  </>
                )}
              </button>
            </form>
          )}

          {/* PASO 2: Ingreso de Código OTP */}
          {paso === "verificacion" && (
            <form onSubmit={handleVerificar} className="login-form">
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <p style={{ fontSize: "0.9rem", color: "var(--text-main)", margin: 0 }}>
                  Ingresa el código de 6 dígitos enviado a:
                </p>
                <p style={{ fontSize: "0.95rem", fontWeight: "700", color: "#002855", margin: "4px 0" }}>
                  {correoOfuscado}
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.85rem",
                    fontWeight: "600",
                    color: segundosRestantes <= 60 ? "#dc2626" : "#475569",
                    background: "#f1f5f9",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    marginTop: "6px"
                  }}
                >
                  <i className="fas fa-clock"></i>
                  <span>Expira en: {tiempoFormateado}</span>
                </div>
              </div>

              {/* Casillas de 6 dígitos */}
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "1.5rem" }}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    style={{
                      width: "48px",
                      height: "56px",
                      textAlign: "center",
                      fontSize: "1.5rem",
                      fontWeight: "700",
                      borderRadius: "8px",
                      border: digit ? "2px solid #059669" : "1.5px solid #cbd5e1",
                      background: digit ? "rgba(5, 150, 105, 0.05)" : "#ffffff",
                      color: "#002855",
                      outline: "none",
                      transition: "all 0.2s"
                    }}
                  />
                ))}
              </div>

              <button type="submit" className="login-btn-submit" disabled={cargando} style={{ background: "#059669" }}>
                {cargando ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Verificando código...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar a la Encuesta</span>
                    <i className="fas fa-arrow-right-to-bracket"></i>
                  </>
                )}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setPaso("solicitud");
                    setError("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--brand-primary)",
                    fontSize: "0.825rem",
                    cursor: "pointer",
                    textDecoration: "underline"
                  }}
                >
                  <i className="fas fa-arrow-left"></i> Cambiar documento/correo
                </button>

                <button
                  type="button"
                  onClick={handleReenviar}
                  disabled={cargando || segundosRestantes > 840} // Cooldown de 1 min
                  style={{
                    background: "none",
                    border: "none",
                    color: segundosRestantes > 840 ? "var(--text-muted)" : "#059669",
                    fontSize: "0.825rem",
                    fontWeight: "600",
                    cursor: segundosRestantes > 840 ? "not-allowed" : "pointer"
                  }}
                >
                  <i className="fas fa-rotate-right"></i> Reenviar código
                </button>
              </div>
            </form>
          )}

          {/* Enlace alternativo a login institucional */}
          <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
            <Link
              to="/"
              style={{
                fontSize: "0.825rem",
                color: "var(--text-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <i className="fas fa-user-shield"></i>
              <span>¿Eres docente o directivo? Ingresa por el Portal Administrativo</span>
            </Link>
          </div>

          {/* Footer */}
          <div className="login-footer" style={{ marginTop: "1.25rem" }}>
            <span>Universidad CESMAG • Vicerrectoría de Evangelización de las Culturas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
