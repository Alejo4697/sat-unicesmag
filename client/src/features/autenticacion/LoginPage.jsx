/* ==========================================================================
   Feature: Autenticación
   LoginPage - migración real de index.html. El mockup no tenía contraseñas
   reales (era una simulación por rol); acá se conserva esa misma UX: se
   elige un rol y el formulario resuelve el primer usuario de ese rol
   (server/src/shared/data/mockData.js -> usuarios) y hace login con ese id.
   Cuando exista autenticación real (RQF01), este formulario pasa a mandar
   email/password de verdad a POST /api/auth/login.
   ========================================================================== */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext.jsx";
import { login } from "./api.js";

const ROLES = [
  { value: "admin", label: "1. Rol Administrativo (Coordinación / Vicerrectora)" },
  { value: "profesional", label: "2. Rol Profesionales (USP, Salud, Jurídicos, Pastoral)" },
  { value: "directivo", label: "3. Rol Directivos (Directores Programa / Docentes Acompañantes)" },
  { value: "reporte_actividades", label: "4. Rol Reporte Actividades (Secretarios, Bienestar)" },
  { value: "estudiante", label: "5. Rol Estudiante (Encuesta Caracterización)" }
];

export default function LoginPage() {
  const { user, usuariosDisponibles, iniciarSesionComo } = useAuth();
  const navigate = useNavigate();
  const [rol, setRol] = useState("admin");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const usuarioSeleccionado = usuariosDisponibles.find((u) => u.rol === rol);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!usuarioSeleccionado) {
      setError("No hay un usuario de ejemplo configurado para ese rol todavía.");
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
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <img src="/img/escudo_unicesmag.png" alt="Escudo Universidad CESMAG" className="escudo-institucional" />
          <h1 className="auth-title">SAT-UNICESMAG</h1>
          <p className="auth-sub">Sistema de Alertas Tempranas y Seguimiento a la Permanencia</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="role-select-card">
            <label htmlFor="login-role">
              <i className="fas fa-user-shield"></i> Rol de Acceso (RQF03)
            </label>
            <select
              id="login-role"
              className="form-select"
              style={{ background: "#FFFFFF", fontWeight: 600, fontSize: "0.8125rem" }}
              value={rol}
              onChange={(e) => setRol(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="input-field-group">
            <label htmlFor="login-email">Correo Institucional</label>
            <input id="login-email" type="email" value={usuarioSeleccionado?.email || ""} readOnly />
          </div>

          <div className="input-field-group">
            <label htmlFor="login-password">Contraseña</label>
            <input id="login-password" type="password" defaultValue="••••••••••••" readOnly />
          </div>

          <button type="submit" className="btn-submit" disabled={enviando}>
            {enviando ? "Ingresando..." : "Ingresar al Sistema"}
          </button>
        </form>

        <div className="auth-footer">
          <span>Universidad CESMAG | Pasto, Nariño</span>
        </div>
      </div>
    </div>
  );
}
