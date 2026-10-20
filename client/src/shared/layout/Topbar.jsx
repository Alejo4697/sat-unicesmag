import { useAuth } from "../context/AuthContext.jsx";

export default function Topbar({ titulo, breadcrumb, onCambiarPassword }) {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={() => document.getElementById("sidebar")?.classList.toggle("show")}>
          <i className="fas fa-bars"></i>
        </button>
        <div>
          <h1 className="topbar-title">{titulo}</h1>
          {breadcrumb && <span className="topbar-breadcrumb">{breadcrumb}</span>}
        </div>
      </div>

      <div className="topbar-right">
        {user && user.rol !== "estudiante" && onCambiarPassword && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onCambiarPassword}
            title="Actualizar mi contraseña de acceso"
          >
            <i className="fas fa-key"></i> Cambiar Contraseña
          </button>
        )}
      </div>
    </header>
  );
}
