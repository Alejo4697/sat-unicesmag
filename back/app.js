import express from "express";
import cors from "cors";

import routeMaster from "./App/routes/routeMaster.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true, // Permite dinámicamente cualquier origen (localhost, IPs de red local, túneles como loca.lt)
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-user-id",
        "Bypass-Tunnel-Reminder",
        "bypass-tunnel-reminder"
      ]
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "sat-unicesmag-api" }),
  );

  // Montaje de rutas de módulos vía routeMaster
  app.use("/api", routeMaster);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
