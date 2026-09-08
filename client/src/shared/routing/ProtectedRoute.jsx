/* ==========================================================================
   ProtectedRoute - equivalente en React del filtro por rol que hacía
   renderDynamicMenu() en menu.js, pero aplicado a la RUTA completa: si el
   rol activo no tiene el módulo, redirige en vez de solo ocultar el link
   del sidebar (el backend igual lo vuelve a bloquear en cada endpoint).
   ========================================================================== */

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { moduleRoles } from "../config/menuConfig.js";

export default function ProtectedRoute({ moduleId, children }) {
  const { user, cargando } = useAuth();

  if (cargando) return null;
  if (!user) return <Navigate to="/" replace />;

  const allowedRoles = moduleRoles(moduleId);
  if (!allowedRoles.includes(user.rol)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
