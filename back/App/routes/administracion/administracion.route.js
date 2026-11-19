/* ==========================================================================
   Feature: Administración - Usuarios y Parámetros (solo admin)
   Ruta Express delegada al Controlador
   ========================================================================== */

import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import catalogosRoutes from "./catalogos.route.js";
import * as administracionController from "../../src/administracion/administracion/administracion.controller.js";

const router = Router();

router.use(identifyUser, requireModule("administracion"));

// Sub-rutas de catálogos
router.use(catalogosRoutes);

// Usuarios y accesos
router.get("/usuarios", administracionController.getUsuarios);
router.post("/usuarios", administracionController.createUsuario);
router.post("/usuarios/gestionar-acceso", administracionController.gestionarAcceso);
router.patch("/usuarios/:id/toggle-estado", administracionController.toggleEstado);
router.post("/usuarios/:id/reset-password", administracionController.resetPassword);
router.delete("/usuarios/:id", administracionController.deleteUsuario);

// Catálogos auxiliares de administración
router.get("/programas", administracionController.getProgramas);
router.get("/cargos-catalogo", administracionController.getCargos);
router.get("/lineas-accion", administracionController.getLineasAccion);

// Sincronización institucional
router.get("/estado-sincronizacion", administracionController.getEstadoSincronizacion);
router.post("/sincronizar", administracionController.sincronizar);

// Umbrales de riesgo
router.get("/umbrales-riesgo", administracionController.getUmbralesRiesgo);
router.put("/umbrales-riesgo", administracionController.updateUmbralesRiesgo);

// Matriz de permisos por rol/módulo
router.get("/matriz-permisos", administracionController.getMatrizPermisos);
router.put("/matriz-permisos", administracionController.updateMatrizPermisos);

export default router;
