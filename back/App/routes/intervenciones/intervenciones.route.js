import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as intervencionesController from "../../src/intervenciones/intervenciones/intervenciones.controller.js";

const router = Router();

router.use(identifyUser, requireModule("intervenciones"));

router.get("/tipos", intervencionesController.getTipos);
router.get("/", intervencionesController.getIntervenciones);
router.post("/", intervencionesController.createIntervencion);
router.patch("/:id", intervencionesController.updateIntervencion);

export default router;
