/* ==========================================================================
   SAT-UNICESMAG - Middleware de control de acceso (RQF03 / RBAC)
   ==========================================================================
   Auth "de mockup": no hay contraseñas ni JWT todavía (el mockup original
   tampoco los tenía: guardaba el usuario activo en localStorage). El cliente
   manda el id del usuario activo en el header `x-user-id` en cada petición;
   este middleware lo resuelve contra MOCK_DATA.usuarios y lo cuelga en
   `req.user`. Cuando haya autenticación real (RQF01), solo hay que
   reemplazar `identifyUser` por la verificación del token — el resto
   (requireModule) no cambia.

   Vive en shared/ (no en features/) porque no es un caso de uso del
   negocio: es infraestructura transversal que TODAS las features usan.
   ========================================================================== */

import { MOCK_DATA } from "../data/mockData.js";
import { rolesParaModulo } from "../security/permisosModulos.js";

export function identifyUser(req, res, next) {
  const userId = req.headers["x-user-id"];
  const user = MOCK_DATA.usuarios.find((u) => u.id === userId);

  if (!user) {
    return res.status(401).json({ error: "No autenticado. Falta o es inválido el header x-user-id." });
  }

  req.user = user;
  next();
}

// requireModule("alertas") -> 403 si el rol del usuario activo no tiene
// acceso a ese módulo según la matriz de permisos (sat.roles_permisos,
// editable desde Administración; ver shared/security/permisosModulos.js).
// Se evalúa en CADA request, así un cambio en la matriz aplica de inmediato.
export function requireModule(moduleId) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado." });
    }
    try {
      const allowedRoles = await rolesParaModulo(moduleId);
      if (!allowedRoles.includes(req.user.rol)) {
        return res.status(403).json({
          error: `El rol "${req.user.rol}" no tiene acceso al módulo "${moduleId}".`
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// requireRole("admin", "directivo") -> para reglas que no están atadas a un
// módulo del menú sino a una acción puntual (ej. crear usuarios).
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado." });
    }
    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: `Esta acción requiere uno de estos roles: ${allowedRoles.join(", ")}.` });
    }
    next();
  };
}
