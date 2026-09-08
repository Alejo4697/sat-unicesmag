/* ==========================================================================
   Feature: Intervenciones (RQF04, RQF16, RQF19)
   GET  /api/intervenciones  -> lista (aplica RNF01 sobre casos VBG)
   POST /api/intervenciones  -> registrar intervención
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";

const router = Router();

router.use(identifyUser, requireModule("intervenciones"));

router.get("/", (req, res) => {
  const { codigoEstudiante } = req.query;
  const lista = codigoEstudiante
    ? MOCK_DATA.intervenciones.filter((i) => i.codigoEstudiante === codigoEstudiante)
    : MOCK_DATA.intervenciones;
  res.json(lista.map((i) => sanitizarIntervencion(i, req.user)));
});

// Espeja guardarIntervencion() de assets/js/intervenciones.js. `adjuntos`
// solo trae nombre/tamaño (RQF16: PDF, máx. 5MB) - validado en el cliente
// antes de enviarlos, igual que en el mockup (no hay almacenamiento real
// de archivos todavía).
router.post("/", (req, res) => {
  const { codigoEstudiante, motivo, resumenAcuerdo, esSensibleVBG, adjuntos } = req.body;

  if (!codigoEstudiante || !motivo || !resumenAcuerdo) {
    return res.status(400).json({ error: "Diligencie todos los campos requeridos." });
  }

  const nueva = {
    id: `INT-2025-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    atendidoPor: req.user.nombre,
    cargoAtendio: req.user.cargo,
    fecha: new Date().toISOString().replace("T", " ").substring(0, 16),
    motivo,
    resumenAcuerdo,
    adjuntos: Array.isArray(adjuntos) ? adjuntos : [],
    esSensibleVBG: !!esSensibleVBG,
    cerrado: true,
    notasAclaratorias: []
  };

  MOCK_DATA.intervenciones.unshift(nueva);
  res.status(201).json(sanitizarIntervencion(nueva, req.user));
});

export default router;
