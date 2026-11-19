import { Router } from "express";
import { identifyUser, requireModule } from "../../../middlewares/requireRole.js";
import * as caracterizacionController from "../../src/caracterizacion/caracterizacion/caracterizacion.controller.js";

const router = Router();

router.use(identifyUser, requireModule("caracterizacion"));

router.get("/encuesta", caracterizacionController.getEncuesta);
router.put("/encuesta/:id", caracterizacionController.updateEncuesta);

router.get("/preguntas", caracterizacionController.getPreguntas);
router.post("/preguntas", caracterizacionController.createPregunta);
router.put("/preguntas/:id", caracterizacionController.updatePregunta);
router.patch("/preguntas/:id/toggle", caracterizacionController.togglePregunta);
router.delete("/preguntas/:id", caracterizacionController.deletePregunta);

router.get("/instrumento", caracterizacionController.getInstrumento);
router.get("/estudiante-info/:codigo", caracterizacionController.getEstudianteInfo);
router.get("/:codigo", caracterizacionController.getHistorialEstudiante);
router.post("/", caracterizacionController.submitEncuesta);

export default router;
