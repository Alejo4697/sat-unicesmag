/* ==========================================================================
   Master Router: Monta todas las rutas de los módulos de la aplicación
   ========================================================================== */

import { Router } from "express";

import menuRoutes from "./menu/menu.route.js";
import authRoutes from "./autenticacion/autenticacion.route.js";
import estudianteRoutes from "./estudiante/estudiante.route.js";
import dashboardRoutes from "./monitoreo/monitoreo.route.js";
import estudiantesRoutes from "./seguimientoEstudiantil/seguimientoEstudiantil.route.js";
import alertasRoutes from "./alertasTempranas/alertasTempranas.route.js";
import intervencionesRoutes from "./intervenciones/intervenciones.route.js";
import remisionesRoutes from "./remisiones/remisiones.route.js";
import caracterizacionRoutes from "./caracterizacion/caracterizacion.route.js";
import reportesRoutes from "./reportesSnies/reportesSnies.route.js";
import administracionRoutes from "./administracion/administracion.route.js";
import actividadesRoutes from "./actividades/actividades.route.js";

const routeMaster = Router();

routeMaster.use("/menu", menuRoutes);
routeMaster.use("/auth", authRoutes);
routeMaster.use("/estudiante", estudianteRoutes);
routeMaster.use("/dashboard", dashboardRoutes);
routeMaster.use("/estudiantes", estudiantesRoutes);
routeMaster.use("/alertas", alertasRoutes);
routeMaster.use("/intervenciones", intervencionesRoutes);
routeMaster.use("/remisiones", remisionesRoutes);
routeMaster.use("/caracterizacion", caracterizacionRoutes);
routeMaster.use("/reportes", reportesRoutes);
routeMaster.use("/administracion", administracionRoutes);
routeMaster.use("/actividades/participantes", actividadesRoutes);

export default routeMaster;
