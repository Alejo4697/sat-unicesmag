import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as estudiantesController from "../../src/seguimientoEstudiantil/estudiantes/estudiantes.controller.js";

const router = Router();

router.use(identifyUser, requireModule("ficha"));

router.get("/", estudiantesController.getEstudiantes);
router.get("/:id", estudiantesController.getEstudianteById);
router.get("/:id/timeline", estudiantesController.getTimeline);

export default router;
