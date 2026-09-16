/* ==========================================================================
   GET /api/menu          -> secciones/ítems del sidebar visibles para el
                             usuario activo (equivalente real, en el backend,
                             a renderDynamicMenu() de assets/js/menu.js)
   GET /api/menu/permisos -> mapa { idModulo: [roles] } vigente

   Vive en shared/ (no en features/) porque no es un caso de uso del
   negocio en sí — es infraestructura de navegación que sirve a todas las
   features. Ambos leen la matriz de permisos editable
   (shared/security/permisosModulos.js); cada endpoint real queda además
   protegido con requireModule.
   ========================================================================== */

import { Router } from "express";
import { identifyUser } from "../middleware/requireRole.js";
import { getMapaPermisos, menuParaRol } from "../security/permisosModulos.js";

const router = Router();

// Sidebar del usuario activo, según la matriz de permisos vigente.
router.get("/", identifyUser, async (req, res, next) => {
  try {
    res.json(await menuParaRol(req.user.rol));
  } catch (err) {
    next(err);
  }
});

// { idModulo: [roles] } - el cliente lo usa para pintar el sidebar, proteger
// rutas y habilitar pestañas. El backend igual revalida cada endpoint.
router.get("/permisos", identifyUser, async (req, res, next) => {
  try {
    res.json(await getMapaPermisos());
  } catch (err) {
    next(err);
  }
});

export default router;
