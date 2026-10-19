/* ==========================================================================
   SAT-UNICESMAG - Cliente HTTP compartido
   ==========================================================================
   Gestiona peticiones a la API adjuntando:
   1. Authorization: Bearer <token> (seguridad de sesión real)
   2. x-user-id (compatibilidad hacia atrás)
   ========================================================================== */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
export const ACTIVE_USER_KEY = "SAT_UNICESMAG_ACTIVE_USER";
export const AUTH_TOKEN_KEY = "SAT_UNICESMAG_AUTH_TOKEN";

function getActiveUserId() {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? JSON.parse(raw).id : null;
  } catch {
    return null;
  }
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function fetchApi(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "No se pudo conectar con el servidor. Verifica que la API esté en ejecución y vuelve a intentarlo.",
        { cause: error }
      );
    }
    throw error;
  }
}

export async function apiFetch(path, options = {}) {
  const userId = getActiveUserId();
  const token = getAuthToken();

  const res = await fetchApi(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Error ${res.status} en ${path}`);
  }

  return res.status === 204 ? null : res.json();
}

export async function apiDownload(path, options = {}) {
  const userId = getActiveUserId();
  const token = getAuthToken();

  const res = await fetchApi(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Error ${res.status} en ${path}`);
  }

  return res.blob();
}
