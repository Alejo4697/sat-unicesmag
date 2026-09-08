import { apiFetch } from "../../shared/api/client.js";

export const listUsuarios = () => apiFetch("/auth/usuarios");
export const login = (userId) => apiFetch("/auth/login", { method: "POST", body: { userId } });
export const getMe = () => apiFetch("/auth/me");
