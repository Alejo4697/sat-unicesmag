import { Router } from "express";
import { identifyUser } from "../../../middlewares/requireRole.js";
import * as estudianteController from "../../src/estudiante/estudiante/estudiante.controller.js";

const router = Router();

router.get("/instrumento", estudianteController.getInstrumento);
router.get("/consultar-correo", estudianteController.consultarCorreo);
router.post("/solicitar-otp", estudianteController.solicitarOtp);
router.post("/verificar-otp", estudianteController.verificarOtp);
router.get("/estado", identifyUser, estudianteController.getEstado);
router.post("/guardar-encuesta", identifyUser, estudianteController.guardarEncuesta);

export default router;
