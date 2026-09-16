/* ==========================================================================
   Feature: Alertas Tempranas (RQF06/RQF07/RQF14/RQF15)
   GET  /api/alertas       -> lista de alertas
   POST /api/alertas       -> crear alerta manual (RQF15)
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarAlerta } from "../../shared/security/vbg.js";
import { directivoPuedeVerEstudiante } from "../../shared/security/alcanceDirectivo.js";

const router = Router();

router.use(identifyUser, requireModule("alertas"));

// TODO: hoy este listado NO se filtra por programa/riesgo para "directivo" -
// un Director ve alertas de TODOS los programas, no solo el suyo. Es un
// comportamiento preexistente, no cubierto por la corrección de
// directivoPuedeVerEstudiante (esa solo protege /estudiantes, /reportes/snies
// y la creación de alertas). Confirmar en la próxima reunión de equipo si
// este listado también debe recortarse al programa/riesgo del Director.
router.get("/", (req, res) => {
  res.json(MOCK_DATA.alertas.map((a) => sanitizarAlerta(a, req.user)));
});

// Espeja crearAlertaManual() de assets/js/alertas.js: el cliente solo manda
// lo que el usuario diligenció (estudiante, tipo, riesgo, descripción); el
// resto (id, categoría, creador, fecha, esVBG) lo decide el servidor -
// nunca se confía en que el cliente mande esos campos.
router.post("/", (req, res) => {
  const { codigoEstudiante, tipo, nivelRiesgo, descripcion } = req.body;

  if (!codigoEstudiante || !tipo || !nivelRiesgo || !descripcion) {
    return res.status(400).json({ error: "Complete todos los campos requeridos." });
  }

  const estudiante = MOCK_DATA.estudiantes.find((e) => e.codigo === codigoEstudiante);

  if (req.user.rol === "directivo" && (!estudiante || !directivoPuedeVerEstudiante(req.user, estudiante))) {
    return res.status(403).json({ error: "No tiene acceso a la información de este estudiante." });
  }

  const nuevaAlerta = {
    id: `ALT-2025-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    nombreEstudiante: estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : codigoEstudiante,
    programa: estudiante ? estudiante.programa : "No especificado",
    tipo,
    categoria: "Manual",
    nivelRiesgo,
    descripcion,
    fechaCreacion: new Date().toISOString(),
    creador: `${req.user.nombre} (${req.user.cargo})`,
    estado: "Abierta",
    esVBG: tipo.includes("VBG") || tipo.includes("Género")
  };

  MOCK_DATA.alertas.unshift(nuevaAlerta);
  res.status(201).json(sanitizarAlerta(nuevaAlerta, req.user));
});

export default router;
