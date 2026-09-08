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

const router = Router();

router.get("/usuarios", (req, res) => {
  res.json(MOCK_DATA.usuarios.map(({ id, nombre, rol, cargo, programa }) => ({ id, nombre, rol, cargo, programa })));
});

router.post("/login", (req, res) => {
  const { userId } = req.body;
  const user = MOCK_DATA.usuarios.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  res.json(user);
});

router.get("/me", identifyUser, (req, res) => {
  res.json(req.user);
});

export default router;
