/* ==========================================================================
   AuthContext - reemplaza la clase AppState (assets/js/state.js) del
   mockup: en vez de leer MOCK_DATA de localStorage, guarda el usuario
   activo en localStorage (para sobrevivir refrescos, igual que antes) y
   trae todo lo demás por API.

   Vive en shared/ porque lo consumen TODAS las features (sidebar, guard de
   rutas, cada página) - no es en sí mismo un caso de uso del negocio, así
   que no llama a features/autenticacion/api.js (eso invertiría la
   dependencia); usa directamente el cliente HTTP compartido.
   ========================================================================== */

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

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
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    apiFetch("/auth/usuarios")
      .then(setUsuariosDisponibles)
      .catch((err) => console.error("No se pudo cargar la lista de usuarios:", err))
      .finally(() => setCargando(false));
  }, []);

  function iniciarSesionComo(usuario) {
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(usuario));
    setUser(usuario);
  }

  function cerrarSesion() {
    localStorage.removeItem(ACTIVE_USER_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, usuariosDisponibles, cargando, iniciarSesionComo, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
