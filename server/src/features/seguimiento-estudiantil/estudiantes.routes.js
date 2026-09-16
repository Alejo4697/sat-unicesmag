/* ==========================================================================
   Feature: Seguimiento Estudiantil (Ficha 360° - RQF12)
   GET /api/estudiantes                   -> lista (búsqueda ?q= por código,
                                              cédula, nombre o programa)
   GET /api/estudiantes/:id               -> ficha completa (:id = código
                                              institucional o cédula)
   GET /api/estudiantes/:id/timeline      -> historial de intervenciones del
                                               estudiante, con la misma
                                               sanitización RNF01 (VBG) que
                                               usa la feature de intervenciones
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { directivoPuedeVerEstudiante } from "../../shared/security/alcanceDirectivo.js";

const router = Router();

router.use(identifyUser, requireModule("ficha"));

// Resuelve un estudiante por su código institucional O su cédula (documento):
// la Ficha 360° (RQF12) permite buscar/abrir por cualquiera de los dos.
function buscarPorIdentificador(id) {
  return MOCK_DATA.estudiantes.find((e) => e.codigo === id || e.documento === id);
}

router.get("/", (req, res) => {
  // Director: solo estudiantes de su propio programa Y en riesgo, antes de
  // aplicar el filtro de texto de la búsqueda.
  const base =
    req.user.rol === "directivo"
      ? MOCK_DATA.estudiantes.filter((e) => directivoPuedeVerEstudiante(req.user, e))
      : MOCK_DATA.estudiantes;

  const q = (req.query.q || "").toLowerCase().trim();
  const estudiantes = !q
    ? base
    : base.filter(
        (e) =>
          e.codigo.toLowerCase().includes(q) ||
          e.documento.toLowerCase().includes(q) ||
          e.nombres.toLowerCase().includes(q) ||
          e.apellidos.toLowerCase().includes(q) ||
          e.programa.toLowerCase().includes(q)
      );
  res.json(estudiantes);
});

router.get("/:id", (req, res) => {
  const estudiante = buscarPorIdentificador(req.params.id);
  if (!estudiante) {
    return res.status(404).json({ error: "Estudiante no encontrado." });
  }
  if (!directivoPuedeVerEstudiante(req.user, estudiante)) {
    return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
  }
  res.json(estudiante);
});

router.get("/:id/timeline", (req, res) => {
  const estudiante = buscarPorIdentificador(req.params.id);
  if (req.user.rol === "directivo" && (!estudiante || !directivoPuedeVerEstudiante(req.user, estudiante))) {
    return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
  }
  const codigo = estudiante ? estudiante.codigo : req.params.id;
  const intervenciones = MOCK_DATA.intervenciones
    .filter((i) => i.codigoEstudiante === codigo)
    .map((i) => sanitizarIntervencion(i, req.user));
  res.json(intervenciones);
});

export default router;
