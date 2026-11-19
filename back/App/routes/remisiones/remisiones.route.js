import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as remisionesController from "../../src/remisiones/remisiones/remisiones.controller.js";

const router = Router();

router.use(identifyUser, requireModule("remisiones"));

router.get("/buscar-estudiante", remisionesController.searchEstudiante);
router.get("/", remisionesController.getRemisiones);
router.get("/areas", remisionesController.getAreas);
router.get("/estados", remisionesController.getEstados);
router.get("/rutas", remisionesController.getRutas);
router.post("/", remisionesController.createRemision);
router.patch("/:id", remisionesController.updateRemision);

export default router;
