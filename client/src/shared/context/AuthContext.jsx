/* ==========================================================================
   AuthContext - reemplaza la clase AppState (assets/js/state.js) del
   mockup: en vez de leer MOCK_DATA de localStorage, guarda el usuario
   activo en localStorage (para sobrevivir refrescos, igual que antes) y
   trae todo lo demás por API.

   También carga la matriz de permisos por módulo (GET /api/menu/permisos),
   editable desde Administración. `puedeAcceder(moduleId)` es lo que usan
   el sidebar, ProtectedRoute y las pestañas de la Ficha 360°.
   `recargarPermisos()` se llama después de editar la matriz para que el
   sidebar se actualice sin recargar la página.

   Vive en shared/ porque lo consumen TODAS las features (sidebar, guard de
   rutas, cada página) - no es en sí mismo un caso de uso del negocio, así
   que no llama a features/autenticacion/api.js (eso invertiría la
   dependencia); usa directamente el cliente HTTP compartido.
   ========================================================================== */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { moduleRoles } from "../config/menuConfig.js";

const ACTIVE_USER_KEY = "SAT_UNICESMAG_ACTIVE_USER";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
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
  // null = usar los permisos por defecto de menuConfig.js
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

  // Cada vez que cambia el usuario activo se vuelve a pedir la matriz
  // (el header x-user-id lo toma apiFetch de localStorage).
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

  function iniciarSesionComo(usuario) {
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(usuario));
    setUser(usuario);
  }

  function cerrarSesion() {
    localStorage.removeItem(ACTIVE_USER_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, usuariosDisponibles, cargando, iniciarSesionComo, cerrarSesion, permisos, puedeAcceder, recargarPermisos }}
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
