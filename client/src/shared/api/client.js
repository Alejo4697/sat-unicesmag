/* ==========================================================================
   SAT-UNICESMAG - Cliente HTTP compartido
   ==========================================================================
   Gestiona peticiones a la API adjuntando:
   1. Authorization: Bearer <token> (seguridad de sesión real)
   Si la API responde 401 con una sesión guardada (token vencido o cerrado),
   se limpia la sesión y se redirige al login que corresponde.
   ========================================================================== */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
export const ACTIVE_USER_KEY = "SAT_UNICESMAG_ACTIVE_USER";
export const AUTH_TOKEN_KEY = "SAT_UNICESMAG_AUTH_TOKEN";

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

// En estas rutas un 401 es un error normal del formulario, no una sesión vencida.
const RUTAS_SIN_REDIRECCION = ["/auth/login", "/estudiante/solicitar-otp", "/estudiante/verificar-otp"];

function manejarSesionVencida(path, res) {
  if (res.status !== 401 || !getAuthToken() || RUTAS_SIN_REDIRECCION.includes(path)) return;
  let esEstudiante = false;
  try {
    esEstudiante = JSON.parse(localStorage.getItem(ACTIVE_USER_KEY))?.rol === "estudiante";
  } catch {
    // sin usuario guardado: se redirige al login del personal
  }
  try {
    localStorage.removeItem(ACTIVE_USER_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // almacenamiento no disponible
  }
  window.location.assign(esEstudiante ? "/estudiante/login" : "/");
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
  const token = getAuthToken();

  const res = await fetchApi(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    manejarSesionVencida(path, res);
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Error ${res.status} en ${path}`);
  }

  return res.status === 204 ? null : res.json();
}

export async function apiDownload(path, options = {}) {
  const token = getAuthToken();

  const res = await fetchApi(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    manejarSesionVencida(path, res);
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Error ${res.status} en ${path}`);
  }

  return res.blob();
}
