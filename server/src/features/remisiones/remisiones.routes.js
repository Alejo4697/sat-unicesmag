/* ==========================================================================
   Feature: Remisiones (RQF09/RQF10 - incluye escalado 48h - RQF17/RQF18)
   GET   /api/remisiones      -> lista
   POST  /api/remisiones      -> crear remisión (RQF17)
   PATCH /api/remisiones/:id  -> actualizar estado / recomendaciones (RQF18)
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";

const ESTADOS_VALIDOS = ["Generada", "Recibida/Asignada", "En Atención", "Atendida", "Devuelta con Recomendaciones"];

const router = Router();

router.use(identifyUser, requireModule("remisiones"));

router.get("/", (req, res) => {
  res.json(MOCK_DATA.remisiones);
});

// Espeja crearRemision() de assets/js/remisiones.js.
router.post("/", (req, res) => {
  const { codigoEstudiante, areaDestino, nivelRiesgo, motivoRemision } = req.body;

  if (!codigoEstudiante || !areaDestino || !motivoRemision) {
    return res.status(400).json({ error: "Complete todos los campos obligatorios." });
  }

  const nueva = {
    id: `REM-2025-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    remitidoPor: `${req.user.nombre} (${req.user.cargo})`,
    areaDestino,
    profesionalAsignado: "Bandeja General / Por Asignar",
    nivelRiesgo: nivelRiesgo || "Medio",
    motivoRemision,
    fechaRemision: new Date().toISOString().replace("T", " ").substring(0, 16),
    estado: "Generada",
    escalado48h: nivelRiesgo === "Alto" || nivelRiesgo === "Muy Alto",
    recomendacionesAula: ""
  };

  MOCK_DATA.remisiones.unshift(nueva);
  res.status(201).json(nueva);
});

// Espeja guardarEstadoRemision() del modal "Gestionar Estado".
router.patch("/:id", (req, res) => {
  const remision = MOCK_DATA.remisiones.find((r) => r.id === req.params.id);
  if (!remision) {
    return res.status(404).json({ error: "Remisión no encontrada." });
  }

  const { estado, recomendacionesAula } = req.body;
  if (estado && !ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Use uno de: ${ESTADOS_VALIDOS.join(", ")}.` });
  }

  if (estado) remision.estado = estado;
  if (recomendacionesAula !== undefined) remision.recomendacionesAula = recomendacionesAula;

  res.json(remision);
});

export default router;
