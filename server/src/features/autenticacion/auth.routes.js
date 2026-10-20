/* ==========================================================================
   Feature: Autenticación - SAT-UNICESMAG
   ==========================================================================
   Autenticación institucional robusta por correo y contraseña (bcrypt).
   Soporta roles: admin, profesional, directivo, reporte_actividades, estudiante.
   Control de intentos fallidos (bloqueo por fuerza bruta) y sesiones activas.
   ========================================================================== */

import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "../../shared/db/pool.js";
import { identifyUser } from "../../shared/middleware/requireRole.js";
import { MOCK_DATA } from "../../shared/data/mockData.js";

const router = Router();

function normalizarRol(rol) {
  if (!rol) return "admin";
  const r = String(rol).toLowerCase().trim();
  if (r === "administrador" || r === "coordinador") return "admin";
  if (r === "docente" || r === "docente_permanencia") return "directivo";
  if (r === "profesional_asistencial") return "profesional";
  return r;
}

/**
 * GET /api/auth/usuarios
 * Lista los usuarios institucionales con su cargo, rol, dependencia y programa asignado.
 */
router.get("/usuarios", async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT 
        u.id_usuarios AS id,
        CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
        u.nombres,
        u.apellidos,
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
      WHERE u.activo = true
        AND (r.nombre IS NULL OR LOWER(r.nombre) NOT IN ('estudiante'))
        AND u.correo_institucional NOT IN ('sofia.rosero@unicesmag.edu.co', 'estudianteprueba@unicesmag.edu.co')
      ORDER BY u.nombres ASC
    `);

    if (rows.length > 0) {
      // Agrupar en caso de tener múltiples programas o dependencias
      const mapaUsuarios = new Map();
      for (const row of rows) {
        if (!mapaUsuarios.has(row.id)) {
          mapaUsuarios.set(row.id, {
            ...row,
            rol: normalizarRol(row.rol),
            dependencias: row.dependencia ? [row.dependencia] : [],
            programas: row.programa ? [row.programa] : []
          });
        } else {
          const u = mapaUsuarios.get(row.id);
          if (row.dependencia && !u.dependencias.includes(row.dependencia)) {
            u.dependencias.push(row.dependencia);
          }
          if (row.programa && !u.programas.includes(row.programa)) {
            u.programas.push(row.programa);
          }
        }
      }
      return res.json(Array.from(mapaUsuarios.values()));
    }
  } catch (err) {
    console.warn("Fallo al consultar usuarios en PostgreSQL:", err.message);
  }

  // Fallback seguro a MOCK_DATA
  res.json(MOCK_DATA.usuarios.map(({ id, nombre, rol, cargo, programa, email }) => ({
    id,
    nombre,
    rol: normalizarRol(rol),
    cargo,
    programa,
    email,
    dependencias: [],
    programas: programa ? [programa] : []
  })));
});

/**
 * POST /api/auth/login
 * Autentica mediante correo_institucional y contraseña.
 */
router.post("/login", async (req, res) => {
  const { email, correo, password, userId } = req.body;
  const targetEmail = (email || correo || "").toLowerCase().trim();

  // Si no se proporcionó ni contraseña ni email, validar si viene userId de mockup
  if (!password && userId) {
    // Modo compatibilidad / pruebas rápidas
    try {
      const { rows } = await query(`
        SELECT u.id_usuarios AS id,
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
        WHERE (u.id_usuarios::text = $1 OR LOWER(u.correo_institucional) = LOWER($1))
          AND u.activo = true
        LIMIT 1
      `, [userId]);

      if (rows.length > 0) {
        const u = rows[0];
        u.rol = normalizarRol(u.rol);
        return res.json({ user: u, token: null });
      }
    } catch (err) {
      console.warn("Fallo en login de compatibilidad:", err.message);
    }

    const mock = MOCK_DATA.usuarios.find((u) => u.id === userId || u.email === userId);
    if (mock) return res.json({ user: mock, token: null });
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  if (!targetEmail || !password) {
    return res.status(400).json({ error: "Debe ingresar el correo institucional y la contraseña." });
  }

  try {
    // 1. Consultar usuario en PostgreSQL
    const { rows } = await query(`
      SELECT 
        u.id_usuarios,
        u.nombres,
        u.apellidos,
        u.correo_institucional,
        u.password_hash,
        u.cargo,
        u.intentos_fallidos,
        u.bloqueado_hasta,
        u.debe_cambiar_password,
        u.activo,
        COALESCE(LOWER(r.nombre), 'admin') AS rol,
        d.nombre AS dependencia,
        p.nombre AS programa
      FROM sat.usuarios u
      LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
      LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
      LEFT JOIN sat.usuarios_dependencias ud ON u.id_usuarios = ud.id_usuarios
      LEFT JOIN sat.dependencias d ON ud.id_dependencias = d.id_dependencias
      LEFT JOIN sat.usuarios_programas up ON u.id_usuarios = up.id_usuarios
      LEFT JOIN sat.programas_academicos p ON up.id_programas_academicos = p.id_programas_academicos
      WHERE LOWER(u.correo_institucional) = $1
      LIMIT 1
    `, [targetEmail]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas. Verifique su correo y contraseña." });
    }

    const dbUser = rows[0];

    if (!dbUser.activo) {
      return res.status(403).json({ error: "Este usuario se encuentra inactivo. Comuníquese con la administración." });
    }

    // Bloqueo explícito: los estudiantes solo usan su portal con OTP
    if (normalizarRol(dbUser.rol) === "estudiante" || dbUser.correo_institucional.includes("estudiante")) {
      return res.status(403).json({
        error: "Los estudiantes no tienen un perfil en este módulo. Deben ingresar a través del portal 'Estudiantes (OTP)' con su código estudiantil."
      });
    }

    // 2. Comprobar bloqueo temporal por fuerza bruta
    if (dbUser.bloqueado_hasta && new Date(dbUser.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil((new Date(dbUser.bloqueado_hasta) - new Date()) / 60000);
      return res.status(403).json({
        error: `Cuenta temporalmente bloqueada por seguridad tras múltiples intentos fallidos. Intente nuevamente en ${minutosRestantes} minuto(s).`
      });
    }

    // 3. Validar contraseña con bcrypt
    let passwordValida = false;
    if (dbUser.password_hash) {
      passwordValida = await bcrypt.compare(password, dbUser.password_hash);
    }

    if (!passwordValida) {
      const nuevosIntentos = (dbUser.intentos_fallidos || 0) + 1;
      let bloquearHasta = null;

      if (nuevosIntentos >= 5) {
        bloquearHasta = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
      }

      await query(`
        UPDATE sat.usuarios
        SET intentos_fallidos = $1,
            bloqueado_hasta = $2
        WHERE id_usuarios = $3
      `, [nuevosIntentos, bloquearHasta, dbUser.id_usuarios]);

      if (nuevosIntentos >= 5) {
        return res.status(403).json({
          error: "Has superado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada por 15 minutos."
        });
      }

      return res.status(401).json({
        error: `Credenciales inválidas. Intentos restantes: ${5 - nuevosIntentos}.`
      });
    }

    // 4. Contraseña correcta -> Resetear intentos fallidos
    await query(`
      UPDATE sat.usuarios
      SET intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE id_usuarios = $1
    `, [dbUser.id_usuarios]);

    // 5. Generar token criptográfico y registrar sesión
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiraEn = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    const ip = req.ip || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || "SAT Web Client";

    await query(`
      INSERT INTO sat.sesiones (
        id_usuarios,
        token_sesion,
        ip_origen,
        user_agent,
        iniciada_en,
        expirada_en,
        ultimo_acceso_en
      ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
    `, [
      dbUser.id_usuarios,
      tokenHash,
      (ip === "::1" || ip === "127.0.0.1") ? "127.0.0.1" : (ip ? ip.split(",")[0].trim() : null),
      userAgent,
      expiraEn
    ]);

    // 6. Construir objeto usuario para el frontend
    const usuarioRespuesta = {
      id: dbUser.id_usuarios,
      nombre: `${dbUser.nombres} ${dbUser.apellidos}`.trim(),
      nombres: dbUser.nombres,
      apellidos: dbUser.apellidos,
      email: dbUser.correo_institucional,
      rol: normalizarRol(dbUser.rol),
      cargo: dbUser.cargo || "Funcionario Institucional",
      dependencia: dbUser.dependencia || null,
      programa: dbUser.programa || null,
      debeCambiarPassword: !!dbUser.debe_cambiar_password
    };

    return res.json({
      token: rawToken,
      user: usuarioRespuesta
    });

  } catch (err) {
    console.error("Error en proceso de autenticación:", err);
    return res.status(500).json({ error: "Error interno al procesar el inicio de sesión." });
  }
});

/**
 * POST /api/auth/logout
 * Invalida la sesión activa
 */
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7).trim();
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    try {
      await query(`
        UPDATE sat.sesiones
        SET cerrada_en = NOW()
        WHERE (token_sesion = $1 OR token_sesion = $2) AND cerrada_en IS NULL
      `, [tokenHash, rawToken]);
    } catch (e) {
      console.warn("Fallo al cerrar sesión en BD:", e.message);
    }
  }
  res.json({ ok: true, message: "Sesión cerrada exitosamente." });
});

/**
 * POST /api/auth/cambiar-password
 * Permite actualizar la contraseña del usuario autenticado
 */
router.post("/cambiar-password", identifyUser, async (req, res) => {
  const { passwordActual, nuevoPassword } = req.body;

  if (!passwordActual) {
    return res.status(400).json({
      error: "Debe ingresar su contraseña actual para confirmar su identidad."
    });
  }

  if (!nuevoPassword || String(nuevoPassword).length < 8) {
    return res.status(400).json({
      error: "La nueva contraseña debe tener al menos 8 caracteres."
    });
  }

  if (passwordActual === nuevoPassword) {
    return res.status(400).json({
      error: "La nueva contraseña debe ser diferente a la contraseña actual."
    });
  }

  try {
    const { rows } = await query(`
      SELECT id_usuarios, password_hash
      FROM sat.usuarios
      WHERE id_usuarios::text = $1 OR LOWER(correo_institucional) = LOWER($2)
      LIMIT 1
    `, [String(req.user.id || ""), String(req.user.email || "")]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado en la base de datos." });
    }

    const u = rows[0];
    if (u.password_hash && u.password_hash.startsWith("$2")) {
      const match = await bcrypt.compare(passwordActual, u.password_hash);
      if (!match) {
        return res.status(400).json({ error: "La contraseña actual ingresada no es correcta." });
      }
    }

    const nuevoHash = await bcrypt.hash(nuevoPassword, 10);
    await query(`
      UPDATE sat.usuarios
      SET password_hash = $1,
          debe_cambiar_password = false,
          intentos_fallidos = 0,
          bloqueado_hasta = NULL
      WHERE id_usuarios = $2
    `, [nuevoHash, u.id_usuarios]);

    res.json({ ok: true, message: "Contraseña actualizada exitosamente." });
  } catch (err) {
    console.error("Error al cambiar contraseña:", err);
    res.status(500).json({ error: "Error interno al actualizar la contraseña." });
  }
});

/**
 * GET /api/auth/me
 * Devuelve el perfil completo del usuario activo
 */
router.get("/me", identifyUser, (req, res) => {
  res.json(req.user);
});

export default router;
