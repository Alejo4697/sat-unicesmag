/* ==========================================================================
   Feature: Autenticación - LoginPage
   Diseño institucional moderno y profesional para SAT-UNICESMAG.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { login } from "./api.js";

const ROLES_INFO = [
  {
    value: "admin",
    label: "Rol Administrativo",
    sublabel: "Coordinación de Acompañamiento / Vicerrectoría",
    icon: "fa-shield-halved",
    badgeColor: "#002855"
  },
  {
    value: "profesional",
    label: "Rol Profesional Asistencial",
    sublabel: "USP, Salud, Consultorios Jurídicos, Trabajo Social",
    icon: "fa-user-doctor",
    badgeColor: "#0891b2"
  },
  {
    value: "directivo",
    label: "Rol Directivo / Docente",
    sublabel: "Directores de Programa y Docentes Acompañantes",
    icon: "fa-chalkboard-user",
    badgeColor: "#2563eb"
  },
  {
    value: "reporte_actividades",
    label: "Rol Reporte de Actividades",
    sublabel: "Secretarías, Bienestar, Deporte y Cultura",
    icon: "fa-clipboard-list",
    badgeColor: "#d97706"
  },
  {
    value: "estudiante",
    label: "Rol Estudiante",
    sublabel: "Diligenciamiento de Encuesta de Caracterización",
    icon: "fa-graduation-cap",
    badgeColor: "#059669"
  }
];

export default function LoginPage() {
  const { user, usuariosDisponibles, iniciarSesionComo } = useAuth();
  const navigate = useNavigate();
  const [rol, setRol] = useState("admin");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const usuarioSeleccionado = usuariosDisponibles.find((u) => u.rol === rol);
  const rolConfig = ROLES_INFO.find((r) => r.value === rol) || ROLES_INFO[0];

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!usuarioSeleccionado) {
      setError("No hay un usuario de ejemplo configurado para ese rol.");
      return;
    }
    setError("");
    setEnviando(true);
    try {
      const usuario = await login(usuarioSeleccionado.id);
      iniciarSesionComo(usuario);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrapper">
      {/* Barra superior con colores institucionales */}
      <div className="login-top-bar"></div>

      <div className="login-container">
        <div className="login-card">
          {/* Encabezado con Logo y Branding */}
          <div className="login-header">
            <div className="login-logo-container">
              <img
                src="/img/escudo_unicesmag.png"
                alt="Escudo Universidad CESMAG"
                className="login-escudo"
              />
            </div>
            <h1 className="login-title">SAT-UNICESMAG</h1>
            <p className="login-subtitle">
              Sistema de Alertas Tempranas y Seguimiento a la Permanencia Estudiantil
            </p>

            {/* Pestañas de Acceso Rápido */}
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
                  fontSize: "0.8rem",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  cursor: "default"
                }}
              >
                <i className="fas fa-user-shield" style={{ marginRight: "6px" }}></i>
                Docentes / Personal
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
                  fontSize: "0.8rem",
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

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error-alert">
                <i className="fas fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Selector de Rol */}
            <div className="login-form-group">
              <label htmlFor="login-role" className="login-label">
                <i className="fas fa-user-shield" style={{ color: "var(--brand-primary)" }}></i>
                Perfil de Acceso
              </label>
              <div className="login-select-wrapper">
                <select
                  id="login-role"
                  className="login-select"
                  value={rol}
                  onChange={(e) => {
                    if (e.target.value === "estudiante") {
                      navigate("/estudiante/login");
                    } else {
                      setRol(e.target.value);
                    }
                  }}
                >
                  {ROLES_INFO.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <i className="fas fa-chevron-down login-select-arrow"></i>
              </div>
            </div>


            {/* Campo: Correo Institucional */}
            <div className="login-form-group">
              <label htmlFor="login-email" className="login-label">
                Correo Institucional
              </label>
              <div className="login-input-wrapper">
                <i className="fas fa-envelope login-input-icon"></i>
                <input
                  id="login-email"
                  type="email"
                  className="login-input"
                  value={usuarioSeleccionado?.email || ""}
                  readOnly
                  placeholder="nombre.apellido@unicesmag.edu.co"
                />
              </div>
            </div>

            {/* Campo: Contraseña */}
            <div className="login-form-group">
              <label htmlFor="login-password" className="login-label">
                Contraseña
              </label>
              <div className="login-input-wrapper">
                <i className="fas fa-lock login-input-icon"></i>
                <input
                  id="login-password"
                  type={passwordVisible ? "text" : "password"}
                  className="login-input"
                  value="cesmag2026*"
                  readOnly
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  title={passwordVisible ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  <i className={`fas ${passwordVisible ? "fa-eye-slash" : "fa-eye"}`}></i>
                </button>
              </div>
            </div>

            {/* Botón de Ingreso */}
            <button type="submit" className="login-btn-submit" disabled={enviando}>
              {enviando ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <i className="fas fa-arrow-right-to-bracket"></i>
                </>
              )}
            </button>
          </form>

          {/* Micro-información de seguridad */}
          <div className="login-security-notice">
            <i className="fas fa-lock-keyhole"></i>
            <span>Acceso seguro con control de confidencialidad y secreto profesional (RNF01)</span>
          </div>

          {/* Footer institucional */}
          <div className="login-footer">
            <span>Universidad CESMAG • San Juan de Pasto, Nariño</span>
            <span style={{ display: "block", marginTop: "0.2rem", fontSize: "0.725rem", color: "var(--text-subtle)" }}>
              Vicerrectoría de Evangelización de las Culturas • Acompañamiento Integral
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
