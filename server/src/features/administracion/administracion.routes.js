/* ==========================================================================
   Feature: Administración - Usuarios y Parámetros (solo admin)
   GET    /api/administracion/usuarios          -> lista completa de usuarios
   POST   /api/administracion/usuarios          -> crear usuario (RQF05)
   DELETE /api/administracion/usuarios/:id      -> desactivar/quitar usuario
   GET    /api/administracion/umbrales-riesgo   -> umbrales actuales (RQF11)
   PUT    /api/administracion/umbrales-riesgo   -> actualizar umbrales (RQF11)
   POST   /api/administracion/sincronizar       -> simula la sincronización
                                                     académica institucional (RQF08)
   GET    /api/administracion/matriz-permisos   -> MENU_CONFIG + roles[].permisos
                                                     (la "matriz de roles y
                                                     permisos" que ya viste como
                                                     mockup, ahora servida real)
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { MENU_CONFIG } from "../../shared/data/menuConfig.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";

const router = Router();

router.use(identifyUser, requireModule("administracion"));

router.get("/usuarios", (req, res) => {
  res.json(MOCK_DATA.usuarios);
});

// Espeja crearUsuario() de assets/js/administracion.js.
router.post("/usuarios", (req, res) => {
  const { nombre, email, rol, cargo, programa } = req.body;
  if (!nombre || !email || !cargo) {
    return res.status(400).json({ error: "Complete todos los campos del usuario." });
  }

  const nuevoUsuario = {
    id: `usr_${Math.floor(100 + Math.random() * 900)}`,
    nombre,
    email,
    rol: rol || "profesional",
    cargo,
    programa: programa || "Todos"
  };

  MOCK_DATA.usuarios.push(nuevoUsuario);
  res.status(201).json(nuevoUsuario);
});

// Espeja desactivarUsuario().
router.delete("/usuarios/:id", (req, res) => {
  const index = MOCK_DATA.usuarios.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  const [eliminado] = MOCK_DATA.usuarios.splice(index, 1);
  res.json(eliminado);
});

router.get("/umbrales-riesgo", (req, res) => {
  res.json(MOCK_DATA.umbralesRiesgo);
});

// Espeja guardarUmbralesRiesgo().
router.put("/umbrales-riesgo", (req, res) => {
  const { alto, medio } = req.body;
  if (alto == null || medio == null) {
    return res.status(400).json({ error: "Debe enviar los umbrales alto y medio." });
  }
  MOCK_DATA.umbralesRiesgo = { alto: Number(alto), medio: Number(medio) };
  res.json(MOCK_DATA.umbralesRiesgo);
});

// Espeja simularSincronizacionAcademica() - sigue siendo una simulación
// (no hay un sistema académico real que consultar todavía), pero ahora
// corre en el servidor en vez de ser un setTimeout puramente decorativo
// en el navegador.
router.post("/sincronizar", (req, res) => {
  res.json({ ok: true, mensaje: "Sincronización de matrículas, inasistencias y calificaciones completada (RQF08)." });
});

router.get("/matriz-permisos", (req, res) => {
  res.json({
    accesoModulos: MENU_CONFIG,
    rolesYPermisos: MOCK_DATA.roles
  });
});

export default router;
