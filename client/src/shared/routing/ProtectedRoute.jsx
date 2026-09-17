/* ==========================================================================
   ProtectedRoute - equivalente en React del filtro por rol que hacía
   renderDynamicMenu() en menu.js, pero aplicado a la RUTA completa: si el
   rol activo no tiene el módulo, redirige en vez de solo ocultar el link
   del sidebar (el backend igual lo vuelve a bloquear en cada endpoint).
   ========================================================================== */

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { MENU_CONFIG } from "../config/menuConfig.js";

// Primer módulo (en orden del menú) al que el rol sí tiene acceso: evita un
// bucle de redirecciones si al rol le quitaron el Tablero General.
function primeraRutaPermitida(puedeAcceder) {
  for (const section of MENU_CONFIG) {
    for (const item of section.items) {
      if (!item.hidden && puedeAcceder(item.id)) return item.href;
    }
  }
  return null;
}

export default function ProtectedRoute({ moduleId, children }) {
  const { user, cargando, puedeAcceder, cerrarSesion } = useAuth();

  if (cargando) return null;
  if (!user) return <Navigate to="/" replace />;

  // Aislamiento estricto del Rol Estudiante
  if (user.rol === "estudiante") {
    if (moduleId !== "estudiante") {
      return <Navigate to="/estudiante/portal" replace />;
    }
    return children;
  }

  // Si un usuario administrativo intenta entrar al módulo de estudiante
  if (moduleId === "estudiante") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!puedeAcceder(moduleId)) {
    const destino = primeraRutaPermitida(puedeAcceder);
    if (destino) return <Navigate to={destino} replace />;

    // El rol no tiene ningún módulo habilitado en la matriz de permisos.
    return (
      <div style={{ maxWidth: 480, margin: "15vh auto", textAlign: "center", padding: "0 16px" }}>
        <h2>Sin módulos habilitados</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Tu rol no tiene acceso a ningún módulo. Solicita al administrador que actualice la matriz de roles y permisos.
        </p>
        <button className="btn btn-primary" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  return children;
}

