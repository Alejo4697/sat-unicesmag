import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// shared: infraestructura transversal (no son casos de uso del negocio)
import menuRoutes from "./shared/routes/menu.routes.js";
import {
  notFoundHandler,
  errorHandler,
} from "./shared/middleware/errorHandler.js";

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
import estudianteRoutes from "./features/estudiante/estudiante.routes.js";
import actividadesParticipantesRoutes from "./features/actividades/participantes.routes.js";

// Límites por IP. Mensaje genérico: no revela qué endpoint ni qué cuenta se limitó.
// No se activa app.set("trust proxy"): hoy la API no corre detrás de un proxy
// inverso; si se despliega detrás de uno, habría que activarlo para que req.ip
// sea la IP real del cliente y no la del proxy.
const limiteExcedido = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intente nuevamente más tarde." },
};

// Login del personal: 10 intentos fallidos cada 15 min por IP (los exitosos no cuentan).
const limitarLogin = rateLimit({
  ...limiteExcedido,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

// OTP de estudiantes: 10 por 15 min por IP + documento. Se incluye el documento
// en la clave para que los estudiantes de una misma red (NAT universitario) no
// se bloqueen entre sí; el límite general de abajo cubre el abuso por IP.
const limitarOtp = rateLimit({
  ...limiteExcedido,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.documento ?? "").trim()}`,
});

// General para el resto de /api: holgado, solo frena abuso evidente.
const limitarGeneral = rateLimit({
  ...limiteExcedido,
  windowMs: 60 * 1000,
  limit: 300,
});

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }),
  );
  app.use(express.json());

  app.use("/api", limitarGeneral);
  app.use("/api/auth/login", limitarLogin);
  app.use("/api/estudiante/solicitar-otp", limitarOtp);
  app.use("/api/estudiante/verificar-otp", limitarOtp);

  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "sat-unicesmag-api" }),
  );

  app.use("/api/menu", menuRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/estudiante", estudianteRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/estudiantes", estudiantesRoutes);
  app.use("/api/alertas", alertasRoutes);
  app.use("/api/intervenciones", intervencionesRoutes);
  app.use("/api/remisiones", remisionesRoutes);
  app.use("/api/caracterizacion", caracterizacionRoutes);
  app.use("/api/reportes", reportesRoutes);
  app.use("/api/administracion", administracionRoutes);
  app.use("/api/actividades/participantes", actividadesParticipantesRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
