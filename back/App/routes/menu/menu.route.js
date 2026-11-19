import { Router } from "express";
import { identifyUser } from "../../../middlewares/requireRole.js";
import * as menuController from "../../src/menu/menu/menu.controller.js";

const router = Router();

// Sidebar del usuario activo, según la matriz de permisos vigente.
router.get("/", identifyUser, menuController.getMenu);

// { idModulo: [roles] } - el cliente lo usa para pintar el sidebar, proteger
// rutas y habilitar pestañas. El backend igual revalida cada endpoint.
router.get("/permisos", identifyUser, menuController.getPermisos);

export default router;
