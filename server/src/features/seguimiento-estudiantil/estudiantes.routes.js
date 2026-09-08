/* ==========================================================================
   Feature: Seguimiento Estudiantil (Ficha 360° - RQF12)
   GET /api/estudiantes                   -> lista (búsqueda ?q=)
   GET /api/estudiantes/:codigo            -> ficha completa de un estudiante
   GET /api/estudiantes/:codigo/timeline   -> historial de intervenciones del
                                               estudiante, con la misma
                                               sanitización RNF01 (VBG) que
                                               usa la feature de intervenciones
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";

const router = Router();

router.use(identifyUser, requireModule("ficha"));

router.get("/", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  const estudiantes = !q
    ? MOCK_DATA.estudiantes
    : MOCK_DATA.estudiantes.filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.documento.toLowerCase().includes(q) ||
          e.nombres.toLowerCase().includes(q) ||
          e.apellidos.toLowerCase().includes(q) ||
          e.programa.toLowerCase().includes(q)
      );
  res.json(estudiantes);
});

router.get("/:codigo", (req, res) => {
  const estudiante = MOCK_DATA.estudiantes.find((e) => e.codigo === req.params.codigo);
  if (!estudiante) {
    return res.status(404).json({ error: "Estudiante no encontrado." });
  }
  res.json(estudiante);
});

router.get("/:codigo/timeline", (req, res) => {
  const intervenciones = MOCK_DATA.intervenciones
    .filter((i) => i.codigoEstudiante === req.params.codigo)
    .map((i) => sanitizarIntervencion(i, req.user));
  res.json(intervenciones);
});

export default router;
