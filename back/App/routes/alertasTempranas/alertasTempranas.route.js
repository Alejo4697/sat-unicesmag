import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as alertasController from "../../src/alertasTempranas/alertas/alertas.controller.js";

const router = Router();

router.use(identifyUser, requireModule("alertas"));

router.get("/", alertasController.getAlertas);
router.post("/", alertasController.createAlerta);

export default router;
