import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as dashboardController from "../../src/monitoreo/dashboard/dashboard.controller.js";

const router = Router();

router.use(identifyUser, requireModule("dashboard"));

router.get("/", dashboardController.getDashboard);
router.get("/notificaciones", dashboardController.getNotificaciones);
router.get("/resultados-caracterizacion", dashboardController.getResultadosCaracterizacion);
router.get("/riesgo-dimensiones", dashboardController.getRiesgoDimensiones);

export default router;
