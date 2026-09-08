import express from "express";
import cors from "cors";

// shared: infraestructura transversal (no son casos de uso del negocio)
import menuRoutes from "./shared/routes/menu.routes.js";
import { notFoundHandler, errorHandler } from "./shared/middleware/errorHandler.js";

// features: cada carpeta es un caso de uso real del sistema (Screaming
// Architecture) - el nombre de la carpeta "grita" qué hace el sistema,
// no qué framework usa.
import authRoutes from "./features/autenticacion/auth.routes.js";
import dashboardRoutes from "./features/monitoreo/dashboard.routes.js";
import estudiantesRoutes from "./features/seguimiento-estudiantil/estudiantes.routes.js";
import alertasRoutes from "./features/alertas-tempranas/alertas.routes.js";
import intervencionesRoutes from "./features/intervenciones/intervenciones.routes.js";
import remisionesRoutes from "./features/remisiones/remisiones.routes.js";
import caracterizacionRoutes from "./features/caracterizacion/caracterizacion.routes.js";
import reportesRoutes from "./features/reportes-snies/reportes.routes.js";
import administracionRoutes from "./features/administracion/administracion.routes.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ ok: true, service: "sat-unicesmag-api" }));

  app.use("/api/menu", menuRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/estudiantes", estudiantesRoutes);
  app.use("/api/alertas", alertasRoutes);
  app.use("/api/intervenciones", intervencionesRoutes);
  app.use("/api/remisiones", remisionesRoutes);
  app.use("/api/caracterizacion", caracterizacionRoutes);
  app.use("/api/reportes", reportesRoutes);
  app.use("/api/administracion", administracionRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
