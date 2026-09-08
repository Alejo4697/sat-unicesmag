/* ==========================================================================
   Feature: Caracterización (Instrumento institucional, 34 ítems)
   GET  /api/caracterizacion/instrumento -> los 34 ítems agrupados por
                                              dimensión (para pintar el form)
   POST /api/caracterizacion             -> { codigoEstudiante, respuestas }
                                              evalúa con evaluarInstrumento()
                                              y persiste el resultado
   GET  /api/caracterizacion/:codigo     -> últimos envíos de un estudiante
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { INSTRUMENTO_ITEMS, evaluarInstrumento } from "./instrumento.js";

const router = Router();

router.use(identifyUser, requireModule("caracterizacion"));

router.get("/instrumento", (req, res) => {
  res.json(INSTRUMENTO_ITEMS);
});

router.get("/:codigo", (req, res) => {
  const envios = MOCK_DATA.caracterizaciones.filter((c) => c.codigoEstudiante === req.params.codigo);
  res.json(envios);
});

router.post("/", (req, res) => {
  const { codigoEstudiante, respuestas } = req.body;

  if (!codigoEstudiante || !respuestas) {
    return res.status(400).json({ error: "Falta el código del estudiante o las respuestas." });
  }

  const totalItems = INSTRUMENTO_ITEMS.length;
  const respondidos = Object.keys(respuestas).length;
  if (respondidos < totalItems) {
    return res.status(400).json({ error: `Por favor complete los ${totalItems} ítems del instrumento (${respondidos}/${totalItems}).` });
  }

  const resultado = evaluarInstrumento(respuestas);

  const envio = {
    id: `CAR-2025-${Math.floor(1000 + Math.random() * 9000)}`,
    codigoEstudiante,
    fecha: new Date().toISOString().replace("T", " ").substring(0, 16),
    ...resultado
  };

  MOCK_DATA.caracterizaciones.unshift(envio);

  // Refleja que el estudiante ya diligenció el instrumento (usado por el
  // Dashboard/RQF20 para calcular faltantes por caracterizar).
  const estudiante = MOCK_DATA.estudiantes.find((e) => e.codigo === codigoEstudiante);
  if (estudiante) estudiante.encuestaRespondida = true;

  res.status(201).json(envio);
});

export default router;
