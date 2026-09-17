/* ==========================================================================
   Feature: Autenticación
   Auth "de mockup" - login por selección de usuario (sin contraseña),
   igual que el selector de rol del index.html original.
   GET  /api/auth/usuarios  -> lista de usuarios disponibles (para el selector)
   POST /api/auth/login     -> { userId } -> devuelve el usuario (el cliente
                                lo guarda y lo reenvía como header x-user-id)
   GET  /api/auth/me        -> usuario activo (requiere header x-user-id)
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser } from "../../shared/middleware/requireRole.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.get("/usuarios", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id_usuarios AS id,
              CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
              u.correo_institucional AS email,
              COALESCE(LOWER(r.nombre), 'admin') AS rol,
              'Personal Institucional' AS cargo,
              COALESCE(p.nombre, 'Permanencia Institucional') AS programa
       FROM sat.usuarios u
       LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
       LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
       LEFT JOIN sat.programas_academicos p ON p.id_programas_academicos IS NOT NULL
       WHERE u.activo = true
       ORDER BY u.nombres ASC
       LIMIT 20`
    );

    if (rows.length > 0) {
      // Combinar con mock para asegurar que todos los roles de prueba estén disponibles si faltan
      const idsDb = new Set(rows.map((r) => r.id));
      const mocksFaltantes = MOCK_DATA.usuarios.filter((m) => !idsDb.has(m.id));
      return res.json([...rows, ...mocksFaltantes]);
    }
  } catch (err) {
    console.warn("Fallo al consultar usuarios en PostgreSQL:", err.message);
  }

  res.json(MOCK_DATA.usuarios.map(({ id, nombre, rol, cargo, programa, email }) => ({ id, nombre, rol, cargo, programa, email })));
});

router.post("/login", async (req, res, next) => {
  const { userId, email } = req.body;
  const lookup = userId || email;

  if (!lookup) {
    return res.status(400).json({ error: "Debe especificar un usuario." });
  }

  try {
    const { rows } = await query(
      `SELECT u.id_usuarios AS id,
              CONCAT(u.nombres, ' ', u.apellidos) AS nombre,
              u.correo_institucional AS email,
              COALESCE(LOWER(r.nombre), 'admin') AS rol,
              'Personal Institucional' AS cargo,
              'Permanencia Institucional' AS programa
       FROM sat.usuarios u
       LEFT JOIN sat.usuarios_roles ur ON u.id_usuarios = ur.id_usuarios
       LEFT JOIN sat.roles r ON ur.id_roles = r.id_roles
       WHERE (u.id_usuarios::text = $1 OR u.correo_institucional = $1)
         AND u.activo = true
       LIMIT 1`,
      [lookup]
    );

    if (rows.length > 0) {
      return res.json(rows[0]);
    }
  } catch (err) {
    console.warn("Fallo al validar login en PostgreSQL:", err.message);
  }

  const user = MOCK_DATA.usuarios.find((u) => u.id === lookup || u.email === lookup);
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  res.json(user);
});

router.get("/me", identifyUser, (req, res) => {
  res.json(req.user);
});

export default router;

