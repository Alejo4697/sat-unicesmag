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
import { query } from "../db/pool.js";

function normalizarRol(rol) {
  if (!rol) return "admin";
  const r = String(rol).toLowerCase().trim();
  if (r === "administrador" || r === "coordinador") return "admin";
  if (r === "docente" || r === "docente_permanencia") return "directivo";
  if (r === "profesional_asistencial") return "profesional";
  return r;
}

export async function identifyUser(req, res, next) {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "No autenticado. Falta o es inválido el header x-user-id." });
  }

  try {
    // 1. Buscar en sat.usuarios (Administrativos / Docentes / Profesionales)
    const { rows: userRows } = await query(
      `SELECT u.id_usuarios AS id, u.nombres, u.apellidos, u.correo_institucional AS email,
              CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
              COALESCE(r.nombre, 'admin') AS rol,
              'Personal Institucional' AS cargo
       FROM sat.usuarios u
       LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
       LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
       WHERE (u.id_usuarios::text = $1 OR u.correo_institucional = $1)
         AND u.activo = true
       LIMIT 1`,
      [userId]
    );

    if (userRows.length > 0) {
      req.user = {
        ...userRows[0],
        rol: normalizarRol(userRows[0].rol)
      };
      return next();
    }


    // 2. Buscar en sat.estudiantes
    const { rows: estRows } = await query(
      `SELECT e.id_estudiantes AS id, e.codigo_externo AS codigo, e.codigo_externo AS "codigoEstudiante",
              e.numero_documento AS documento, e.numero_documento AS "numeroDocumento",
              e.nombres, e.apellidos, CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
              e.correo_institucional AS email, e.correo_institucional AS "correoInstitucional",
              e.semestre_actual AS semestre,
              'estudiante' AS rol, 'Estudiante Activo' AS cargo, p.nombre AS programa
       FROM sat.estudiantes e
       LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
       WHERE e.id_estudiantes::text = $1 OR e.codigo_externo = $1 OR e.numero_documento = $1
       LIMIT 1`,
      [userId]
    );

    if (estRows.length > 0) {
      req.user = estRows[0];
      return next();
    }
  } catch (dbErr) {
    console.warn("Fallo al resolver usuario en PostgreSQL:", dbErr.message);
  }

  // 3. Fallback a MOCK_DATA
  const user = MOCK_DATA.usuarios.find((u) => u.id === userId || u.email === userId);
  if (user) {
    req.user = user;
    return next();
  }

  const mockEst = MOCK_DATA.estudiantes.find((e) => e.codigo === userId || e.documento === userId || `est_${e.codigo}` === userId);
  if (mockEst) {
    req.user = {
      id: `est_${mockEst.codigo}`,
      codigo: mockEst.codigo,
      codigoEstudiante: mockEst.codigo,
      nombre: `${mockEst.nombres} ${mockEst.apellidos}`,
      email: mockEst.email,
      rol: "estudiante",
      cargo: "Estudiante Activo",
      semestre: mockEst.semestre,
      programa: mockEst.programa
    };
    return next();
  }

  return res.status(401).json({ error: "No autenticado. Usuario no encontrado en base de datos ni registros activos." });
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
