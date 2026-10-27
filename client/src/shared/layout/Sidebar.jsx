/* ==========================================================================
   Sidebar - misma estructura/clases que el <aside class="sidebar"> repetido
   en cada .html original (variables.css/main.css ya la estilan tal cual).
   El listado de módulos reemplaza a renderDynamicMenu() de menu.js.
   ========================================================================== */

import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { menuForRole } from "../config/menuConfig.js";
import { getNotificacionesCasos } from "../../features/monitoreo/api.js";
import CambiarPasswordModal from "./CambiarPasswordModal.jsx";

// Cada cuánto se consulta si llegaron remisiones/intervenciones nuevas.
const INTERVALO_NOTIFICACIONES_MS = 5000;

export default function Sidebar({ onCambiarPassword }) {
  const { user, cerrarSesion, permisos } = useAuth();
  const navigate = useNavigate();
  const [modalLocalAbierto, setModalLocalAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState(0);

  const cargoLower = String(user?.cargo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esDocenteAcompanante =
    !cargoLower.includes("asistencial") &&
    !cargoLower.includes("psicolog") &&
    (cargoLower.includes("docente") ||
      cargoLower.includes("acompana") ||
      cargoLower.includes("tutor") ||
      cargoLower.includes("tiempo completo") ||
      cargoLower.includes("medio tiempo") ||
      cargoLower.includes("catedra"));
  const esAdmin = user?.rol === "admin" && !esDocenteAcompanante;

  // Contador de la bandeja de casos (todos los roles excepto administrador y estudiante).
  useEffect(() => {
    if (!user || esAdmin || user.rol === "estudiante") {
      setNotificaciones(0);
      return undefined;
    }
    let activo = true;
    const cargar = () =>
      getNotificacionesCasos()
        .then((n) => activo && setNotificaciones(n?.total || 0))
        .catch(() => {});
    cargar();
    window.addEventListener("sat:casos-updated", cargar);
    const timer = setInterval(cargar, INTERVALO_NOTIFICACIONES_MS);
    return () => {
      activo = false;
      window.removeEventListener("sat:casos-updated", cargar);
      clearInterval(timer);
    };
  }, [user, esAdmin]);

  // `permisos` = matriz editable desde Administración (null -> por defecto).
  const secciones = user ? menuForRole(user.rol, permisos) : [];
  const iniciales = user ? user.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("") : "";

  function handleCerrarSesion(e) {
    e.preventDefault();
    cerrarSesion();
    navigate("/");
  }

  function handleAbrirCambioPassword() {
    if (onCambiarPassword) {
      onCambiarPassword();
    } else {
      setModalLocalAbierto(true);
    }
  }

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-brand">
        <div className="brand-escudo">
          <img src="/img/escudo_unicesmag.png" alt="Escudo UNICESMAG" />
        </div>
        <div className="brand-info">
          <span className="brand-title">UNICESMAG</span>
          <span className="brand-subtitle">SAT Permanencia</span>
        </div>
      </div>

      {user && (
        <div className="sidebar-user">
          <div className="sidebar-avatar" id="sidebar-user-avatar">
            {iniciales}
          </div>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-name" id="sidebar-user-name">
              {user.nombre}
            </span>
            <span className="sidebar-user-role" id="sidebar-user-role">
              {user.cargo}
            </span>
          </div>
        </div>
      )}

      <ul className="sidebar-nav" id="sidebar-dynamic-nav">
        {secciones.map((section) => (
          <li key={section.title} style={{ listStyle: "none" }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li className="nav-section-title">{section.title}</li>
              {section.items.map((item) => (
                <li className="nav-item" key={item.id}>
                  <NavLink
                    to={item.href}
                    onClick={() => document.getElementById("sidebar")?.classList.remove("show")}
                    className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                  >
                    <i className={`fas ${item.icon}`}></i>
                    <span>{item.name}</span>
                    {(item.id === "remisiones" || item.id === "dashboard") && notificaciones > 0 && (
                      <span
                        title="Casos nuevos en tu bandeja"
                        style={{
                          marginLeft: "auto",
                          backgroundColor: "#DC2626",
                          color: "#fff",
                          borderRadius: "999px",
                          padding: "0.1rem 0.5rem",
                          fontSize: "0.7rem",
                          fontWeight: 700
                        }}
                      >
                        {notificaciones}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {user && user.rol !== "estudiante" && (
          <button
            type="button"
            onClick={handleAbrirCambioPassword}
            className="btn btn-outline btn-sm"
            style={{
              width: "100%",
              color: "#E2E8F0",
              borderColor: "var(--sidebar-border)",
              background: "rgba(255, 255, 255, 0.04)"
            }}
          >
            <i className="fas fa-key"></i> Cambiar Contraseña
          </button>
        )}
        <a
          href="/"
          onClick={handleCerrarSesion}
          className="btn btn-outline btn-sm"
          style={{ width: "100%", color: "#94A3B8", borderColor: "var(--sidebar-border)", background: "transparent" }}
        >
          <i className="fas fa-arrow-right-from-bracket"></i> Cerrar Sesión
        </a>
      </div>

      {!onCambiarPassword && (
        <CambiarPasswordModal abierto={modalLocalAbierto} onClose={() => setModalLocalAbierto(false)} />
      )}
    </aside>
  );
}
