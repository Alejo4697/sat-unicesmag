/* ==========================================================================
   AuthContext - SAT-UNICESMAG
   ==========================================================================
   Gestiona la autenticación global, tokens de sesión y matriz de permisos.
   Cierra sesión automáticamente tras 30 min de inactividad.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, ACTIVE_USER_KEY, AUTH_TOKEN_KEY } from "../api/client.js";
import { moduleRoles } from "../config/menuConfig.js";
import { useInactivityTimeout } from "../hooks/useInactivityTimeout.js";

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [permisos, setPermisos] = useState(null);
  const [cargandoPermisos, setCargandoPermisos] = useState(!!user);

  useEffect(() => {
    apiFetch("/auth/usuarios")
      .then(setUsuariosDisponibles)
      .catch((err) => console.error("No se pudo cargar la lista de usuarios:", err))
      .finally(() => setCargandoUsuarios(false));
  }, []);

  const recargarPermisos = useCallback(() => {
    return apiFetch("/menu/permisos")
      .then(setPermisos)
      .catch((err) => {
        console.error("No se pudo cargar la matriz de permisos; se usan los valores por defecto:", err);
        setPermisos(null);
      })
      .finally(() => setCargandoPermisos(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setPermisos(null);
      setCargandoPermisos(false);
      return;
    }
    setCargandoPermisos(true);
    recargarPermisos();
  }, [user, recargarPermisos]);

  const puedeAcceder = useCallback(
    (moduleId) => !!user && moduleRoles(moduleId, permisos).includes(user.rol),
    [user, permisos]
  );

  const cargando = cargandoUsuarios || cargandoPermisos;

  function iniciarSesionComo(usuario, token = null) {
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(usuario));
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    setUser(usuario);
  }

  function cerrarSesion() {
    apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem(ACTIVE_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  }

  function cerrarSesionPorInactividad() {
    const esEstudiante = user?.rol === "estudiante";
    cerrarSesion();
    navigate(esEstudiante ? "/estudiante/login" : "/", { replace: true });
  }

  useInactivityTimeout(!!user, INACTIVITY_TIMEOUT_MS, cerrarSesionPorInactividad);

  return (
    <AuthContext.Provider
      value={{
        user,
        usuariosDisponibles,
        cargando,
        iniciarSesionComo,
        cerrarSesion,
        permisos,
        puedeAcceder,
        recargarPermisos
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
