import { Router } from "express";
import * as catalogosController from "../../src/administracion/catalogos/catalogos.controller.js";

const areasRemision = Router();
areasRemision.get("/", catalogosController.getAreas);
areasRemision.post("/", catalogosController.createArea);
areasRemision.put("/:id", catalogosController.updateArea);
areasRemision.patch("/:id", catalogosController.toggleArea);

const estadosRemision = Router();
estadosRemision.get("/", catalogosController.getEstados);
estadosRemision.post("/", catalogosController.createEstado);
estadosRemision.put("/:id", catalogosController.updateEstado);
estadosRemision.patch("/:id", catalogosController.toggleEstado);

const tiposIntervencion = Router();
tiposIntervencion.get("/", catalogosController.getTipos);
tiposIntervencion.post("/", catalogosController.createTipo);
tiposIntervencion.put("/:id", catalogosController.updateTipo);
tiposIntervencion.patch("/:id", catalogosController.toggleTipo);

const router = Router();
router.use("/areas-remision", areasRemision);
router.use("/estados-remision", estadosRemision);
router.use("/tipos-intervencion", tiposIntervencion);

export default router;
