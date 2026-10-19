/* ==========================================================================
   SAT-UNICESMAG - Middleware de control de acceso (RBAC) y resolución de sesión
   ==========================================================================
   Resuelve el usuario autenticado a partir de:
   1. Header Authorization: Bearer <token> validado contra sat.sesiones en BD.
   2. Fallback temporal header x-user-id (para compatibilidad).
   
   Provee:
   - identifyUser: middleware transversal para inyectar req.user con sus roles,
     dependencias asignadas y programas académicos autorizados.
   - requireModule(moduleId): valida contra la matriz de permisos por módulo.
   - requireRole(...allowedRoles): valida que el rol activo esté permitido.
   ========================================================================== */

import crypto from "node:crypto";
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
  const authHeader = req.headers.authorization;
  const legacyUserId = req.headers["x-user-id"];

  let sessionToken = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    sessionToken = authHeader.slice(7).trim();
  }

  // 1. Verificación por Token de Sesión (sat.sesiones)
  if (sessionToken) {
    try {
      const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const { rows: sessionRows } = await query(`
        SELECT id_sesiones, id_usuarios, id_estudiantes, expirada_en
        FROM sat.sesiones
        WHERE (token_sesion = $1 OR token_sesion = $2)
          AND cerrada_en IS NULL
          AND expirada_en > NOW()
        LIMIT 1
      `, [tokenHash, sessionToken]);

      if (sessionRows.length > 0) {
        const ses = sessionRows[0];

        // Actualizar último acceso de forma asíncrona sin bloquear la respuesta
        query(`UPDATE sat.sesiones SET ultimo_acceso_en = NOW() WHERE id_sesiones = $1`, [ses.id_sesiones])
          .catch((e) => console.warn("Error actualizando ultimo_acceso_en:", e.message));

        // Caso A: Sesión de funcionario institucional (id_usuarios)
        if (ses.id_usuarios) {
          const { rows: userRows } = await query(`
            SELECT 
              u.id_usuarios AS id,
              u.nombres,
              u.apellidos,
              CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
              u.correo_institucional AS email,
              COALESCE(LOWER(r.nombre), 'admin') AS rol,
              COALESCE(u.cargo, 'Funcionario Institucional') AS cargo,
              d.nombre AS dependencia,
              p.nombre AS programa,
              u.debe_cambiar_password AS "debeCambiarPassword"
            FROM sat.usuarios u
            LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
            LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
            LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
            LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
            LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
            LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
            WHERE u.id_usuarios = $1 AND u.activo = true
            LIMIT 1
          `, [ses.id_usuarios]);

          if (userRows.length > 0) {
            req.user = {
              ...userRows[0],
              rol: normalizarRol(userRows[0].rol)
            };
            return next();
          }
        }

        // Caso B: Sesión de estudiante (id_estudiantes)
        if (ses.id_estudiantes) {
          const { rows: estRows } = await query(`
            SELECT 
              e.id_estudiantes AS id,
              e.codigo_externo AS codigo,
              e.codigo_externo AS "codigoEstudiante",
              e.numero_documento AS documento,
              e.numero_documento AS "numeroDocumento",
              e.nombres,
              e.apellidos,
              CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
              e.correo_institucional AS email,
              e.correo_institucional AS "correoInstitucional",
              e.semestre_actual AS semestre,
              'estudiante' AS rol,
              'Estudiante Activo' AS cargo,
              p.nombre AS programa
            FROM sat.estudiantes e
            LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
            WHERE e.id_estudiantes = $1
            LIMIT 1
          `, [ses.id_estudiantes]);

          if (estRows.length > 0) {
            req.user = estRows[0];
            return next();
          }
        }
      }
    } catch (err) {
      console.warn("Fallo al validar sesión en sat.sesiones:", err.message);
    }
  }

  // 2. Fallback temporal por header x-user-id
  if (legacyUserId) {
    try {
      const { rows: userRows } = await query(`
        SELECT u.id_usuarios AS id, u.nombres, u.apellidos, u.correo_institucional AS email,
               CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
               COALESCE(LOWER(r.nombre), 'admin') AS rol,
               COALESCE(u.cargo, 'Funcionario Institucional') AS cargo,
               d.nombre AS dependencia,
               p.nombre AS programa,
               u.debe_cambiar_password AS "debeCambiarPassword"
        FROM sat.usuarios u
        LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
        LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
        LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
        LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
        LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
        LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
        WHERE (u.id_usuarios::text = $1 OR LOWER(u.correo_institucional) = LOWER($1))
          AND u.activo = true
        LIMIT 1
      `, [legacyUserId]);

      if (userRows.length > 0) {
        req.user = {
          ...userRows[0],
          rol: normalizarRol(userRows[0].rol)
        };
        return next();
      }

      // Buscar en estudiantes
      const { rows: estRows } = await query(`
        SELECT e.id_estudiantes AS id, e.codigo_externo AS codigo, e.codigo_externo AS "codigoEstudiante",
               e.numero_documento AS documento, e.numero_documento AS "numeroDocumento",
               e.nombres, e.apellidos, CONCAT(e.nombres, ' ', e.apellidos) AS nombre,
               e.correo_institucional AS email, e.correo_institucional AS "correoInstitucional",
               e.semestre_actual AS semestre,
               'estudiante' AS rol, 'Estudiante Activo' AS cargo, p.nombre AS programa
        FROM sat.estudiantes e
        LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
        WHERE e.id_estudiantes::text = $1 OR e.codigo_externo = $1 OR e.numero_documento = $1
        LIMIT 1
      `, [legacyUserId]);

      if (estRows.length > 0) {
        req.user = estRows[0];
        return next();
      }
    } catch (dbErr) {
      console.warn("Fallo al resolver usuario en fallback PostgreSQL:", dbErr.message);
    }

    // Fallback MOCK_DATA
    const user = MOCK_DATA.usuarios.find((u) => u.id === legacyUserId || u.email === legacyUserId);
    if (user) {
      req.user = { ...user, rol: normalizarRol(user.rol) };
      return next();
    }

    const mockEst = MOCK_DATA.estudiantes.find(
      (e) => e.codigo === legacyUserId || e.documento === legacyUserId || `est_${e.codigo}` === legacyUserId
    );
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
  }

  return res.status(401).json({
    error: "No autenticado. Por favor inicie sesión con sus credenciales institucionales."
  });
}

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

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado." });
    }
    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        error: `Esta acción requiere uno de estos roles: ${allowedRoles.join(", ")}.`
      });
    }
    next();
  };
}
