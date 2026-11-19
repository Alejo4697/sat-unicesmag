import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as reportesController from "../../src/reportesSnies/reportes/reportes.controller.js";

const router = Router();

router.use(identifyUser, requireModule("reportes"));

router.get("/", reportesController.getResumen);
router.get("/filtros", reportesController.getFiltros);
router.get("/snies", reportesController.getSnies);
router.get("/intervenciones", reportesController.getIntervenciones);
router.get("/remisiones", reportesController.getRemisiones);

export default router;
