import { apiFetch } from "../../shared/api/client.js";

export const listUsuarios = () => apiFetch("/auth/usuarios");

export const login = (credentials) => {
  const body = typeof credentials === "object" ? credentials : { userId: credentials };
  return apiFetch("/auth/login", { method: "POST", body });
};

export const logout = () => apiFetch("/auth/logout", { method: "POST" });

export const cambiarPassword = ({ passwordActual, nuevoPassword }) =>
  apiFetch("/auth/cambiar-password", { method: "POST", body: { passwordActual, nuevoPassword } });

export const getMe = () => apiFetch("/auth/me");
