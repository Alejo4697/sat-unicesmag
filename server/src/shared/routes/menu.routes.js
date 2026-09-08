/* ==========================================================================
   GET /api/menu -> secciones/ítems del sidebar visibles para el usuario
   activo (equivalente real, en el backend, a renderDynamicMenu() de
   assets/js/menu.js).

   Vive en shared/ (no en features/) porque no es un caso de uso del
   negocio en sí — es infraestructura de navegación que sirve a todas las
   features. El cliente ya vuelve a filtrar por rol en
   client/src/shared/config/menuConfig.js para pintar el sidebar sin
   esperar la respuesta, pero cada endpoint real queda protegido también
   acá con requireModule.
   ========================================================================== */

import { Router } from "express";
import { MENU_CONFIG } from "../data/menuConfig.js";
import { identifyUser } from "../middleware/requireRole.js";

const router = Router();

router.get("/", identifyUser, (req, res) => {
  const visible = MENU_CONFIG.filter((section) => section.roles.includes(req.user.rol)).map(
    ({ title, items }) => ({ title, items })
  );
  res.json(visible);
});

export default router;
