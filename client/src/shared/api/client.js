/* ==========================================================================
   Wrapper mínimo de fetch: agrega la URL base y el header x-user-id (auth
   "de mockup" — ver server/src/shared/middleware/requireRole.js) del
   usuario activo guardado por AuthContext. Cada features/<feature>/api.js
   lo importa; nunca al revés.
   ========================================================================== */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const ACTIVE_USER_KEY = "SAT_UNICESMAG_ACTIVE_USER";

function getActiveUserId() {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? JSON.parse(raw).id : null;
  } catch {
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  const userId = getActiveUserId();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
