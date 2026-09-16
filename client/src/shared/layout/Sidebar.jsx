/* ==========================================================================
   Sidebar - misma estructura/clases que el <aside class="sidebar"> repetido
   en cada .html original (variables.css/main.css ya la estilan tal cual).
   El listado de módulos reemplaza a renderDynamicMenu() de menu.js.
   ========================================================================== */

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { menuForRole } from "../config/menuConfig.js";

export default function Sidebar() {
  const { user, cerrarSesion, permisos } = useAuth();
  const navigate = useNavigate();
  // `permisos` = matriz editable desde Administración (null -> por defecto).
  const secciones = user ? menuForRole(user.rol, permisos) : [];
  const iniciales = user ? user.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("") : "";

  function handleCerrarSesion(e) {
    e.preventDefault();
    cerrarSesion();
    navigate("/");
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
                  <NavLink to={item.href} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                    <i className={`fas ${item.icon}`}></i>
                    <span>{item.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <a
          href="/"
          onClick={handleCerrarSesion}
          className="btn btn-outline btn-sm"
          style={{ width: "100%", color: "#94A3B8", borderColor: "var(--sidebar-border)", background: "transparent" }}
        >
          <i className="fas fa-arrow-right-from-bracket"></i> Cerrar Sesión
        </a>
      </div>
    </aside>
  );
}
