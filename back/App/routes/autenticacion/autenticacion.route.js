import { Router } from "express";
import { identifyUser } from "../../../middlewares/requireRole.js";
import * as authController from "../../src/autenticacion/auth/auth.controller.js";

const router = Router();

router.get("/usuarios", identifyUser, authController.getUsuarios);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/cambiar-password", identifyUser, authController.cambiarPassword);
router.post("/solicitar-recuperacion", authController.solicitarRecuperacion);
router.post("/restablecer-password", authController.restablecerPassword);
router.get("/me", identifyUser, authController.getMe);

export default router;
