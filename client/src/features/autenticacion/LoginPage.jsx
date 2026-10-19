/* ==========================================================================
   Feature: Autenticación - LoginPage
   SAT-UNICESMAG - Sistema de Alertas Tempranas Institucional
   Inicio de sesión seguro mediante credenciales institucionales y redirección
   estricta a la vista asignada según el rol obtenido de la base de datos.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { login } from "./api.js";

/**
 * Determina la vista principal asignada según el rol oficial del usuario.
 */
function rutaPorRol(rol) {
  switch (rol) {
    case "admin":
      return "/dashboard";
    case "profesional":
      return "/remisiones"; // Vista de atención asistencial y casos remitidos
    case "directivo":
      return "/dashboard"; // Vista de monitoreo y permanencia por programa
    case "reporte_actividades":
      return "/actividades"; // Módulo de registro de actividades VEC
    case "estudiante":
      return "/estudiante/portal";
    default:
      return "/dashboard";
  }
}

export default function LoginPage() {
  const { user, iniciarSesionComo } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Si ya hay una sesión activa, redirigir a su vista autorizada
  useEffect(() => {
    if (user) {
      navigate(rutaPorRol(user.rol), { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    const correoLimpio = email.trim().toLowerCase();

    if (!correoLimpio || !password) {
      setError("Por favor ingrese su correo institucional y su contraseña.");
      return;
    }

    if (!correoLimpio.endsWith("@unicesmag.edu.co")) {
      setError("Debe ingresar un correo institucional válido (@unicesmag.edu.co).");
      return;
    }

    setError("");
    setEnviando(true);

    try {
      // 1. Envío de credenciales a la API para validación contra PostgreSQL
      const resp = await login({ email: correoLimpio, password });
      const usuario = resp.user || resp;
      const token = resp.token || null;

      if (!usuario || !usuario.rol) {
        throw new Error("No se pudo determinar el rol asignado en la base de datos.");
      }

      // 2. Almacenamiento seguro de sesión
      iniciarSesionComo(usuario, token);

      // 3. Redirección estricta a la vista correspondiente
      const destino = rutaPorRol(usuario.rol);
      navigate(destino, { replace: true });

    } catch (err) {
      setError(err.message || "Credenciales incorrectas. Verifique su correo y contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-top-bar"></div>

      <div className="login-container" style={{ maxWidth: "460px" }}>
        <div className="login-card" style={{ padding: "2.25rem 2rem" }}>
          {/* Encabezado Institucional */}
          <div className="login-header" style={{ marginBottom: "1.5rem", textAlign: "center" }}>
            <div className="login-logo-container" style={{ marginBottom: "0.75rem" }}>
              <img
                src="/img/escudo_unicesmag.png"
                alt="Escudo Universidad CESMAG"
                className="login-escudo"
              />
            </div>
            <h1 className="login-title" style={{ fontSize: "1.35rem", fontWeight: "800", color: "#002855" }}>
              SAT-UNICESMAG
            </h1>
            <p className="login-subtitle" style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Sistema de Alertas Tempranas y Acompañamiento Integral
            </p>

            {/* Alternador de portal */}
            <div style={{ display: "flex", background: "#f1f5f9", padding: "4px", borderRadius: "8px", marginTop: "1rem" }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#ffffff",
                  color: "#002855",
                  fontWeight: "700",
                  fontSize: "0.825rem",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: "default"
                }}
              >
                <i className="fas fa-id-badge" style={{ marginRight: "6px", color: "#002855" }}></i>
                Funcionarios y Docentes
              </button>
              <button
                type="button"
                onClick={() => navigate("/estudiante/login")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "#059669",
                  fontWeight: "600",
                  fontSize: "0.825rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <i className="fas fa-graduation-cap"></i>
                <span>Estudiantes (OTP)</span>
              </button>
            </div>
          </div>

          {/* Formulario de Login */}
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error-alert" style={{ marginBottom: "1.25rem" }}>
                <i className="fas fa-triangle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Campo: Correo Institucional */}
            <div className="login-form-group" style={{ marginBottom: "1.25rem" }}>
              <label htmlFor="login-email" className="login-label">
                <i className="fas fa-envelope" style={{ color: "#002855" }}></i>
                Correo Electrónico Institucional
              </label>
              <div className="login-input-wrapper">
                <input
                  id="login-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  className="login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@unicesmag.edu.co"
                />
              </div>
            </div>

            {/* Campo: Contraseña */}
            <div className="login-form-group" style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="login-password" className="login-label">
                <i className="fas fa-lock" style={{ color: "#002855" }}></i>
                Contraseña
              </label>
              <div className="login-input-wrapper">
                <input
                  id="login-password"
                  type={passwordVisible ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  title={passwordVisible ? "Ocultar contraseña" : "Ver contraseña"}
                  tabIndex={-1}
                >
                  <i className={`fas ${passwordVisible ? "fa-eye-slash" : "fa-eye"}`}></i>
                </button>
              </div>
            </div>

            {/* Botón de Ingreso */}
            <button
              type="submit"
              className="login-btn-submit"
              disabled={enviando}
              style={{ width: "100%", padding: "0.75rem", fontWeight: "700" }}
            >
              {enviando ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Validando en base de datos...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <i className="fas fa-arrow-right-to-bracket" style={{ marginLeft: "8px" }}></i>
                </>
              )}
            </button>
          </form>

          {/* Aviso de Confidencialidad y Seguridad */}
          <div className="login-security-notice" style={{ marginTop: "1.5rem" }}>
            <i className="fas fa-shield-halved"></i>
            <span>Acceso controlado por RBAC y secreto profesional según perfil institucional</span>
          </div>

          {/* Footer Institucional */}
          <div className="login-footer" style={{ marginTop: "1.25rem", textAlign: "center" }}>
            <span>Universidad CESMAG • San Juan de Pasto</span>
            <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.725rem", color: "#64748b" }}>
              Vicerrectoría de Evangelización de las Culturas • Permanencia Estudiantil
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
