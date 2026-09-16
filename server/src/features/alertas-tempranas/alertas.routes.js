/* ==========================================================================
   Feature: Alertas Tempranas (RQF06/RQF07/RQF14/RQF15)
   GET  /api/alertas       -> lista de alertas
   POST /api/alertas       -> crear alerta manual (RQF15)
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarAlerta } from "../../shared/security/vbg.js";
<<<<<<< HEAD
import { directivoPuedeVerEstudiante } from "../../shared/security/alcanceDirectivo.js";
=======
import { query } from "../../shared/db/pool.js";
>>>>>>> 309929b (Cambios)

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
router.post("/", async (req, res, next) => {
  try {
    const { codigoEstudiante, tipo, nivelRiesgo, descripcion } = req.body;

    if (!codigoEstudiante || !tipo || !nivelRiesgo || !descripcion) {
      return res.status(400).json({ error: "Complete todos los campos requeridos." });
    }

    const cleanId = String(codigoEstudiante).trim();
    let estudiante = null;

    // 1. Buscar en sat.estudiantes (PostgreSQL)
    try {
      const { rows } = await query(
        `SELECT e.id_estudiantes AS id,
                e.codigo_externo AS codigo,
                e.numero_documento AS documento,
                e.nombres,
                e.apellidos,
                COALESCE(p.nombre, 'Ingeniería de Sistemas') AS programa
         FROM sat.estudiantes e
         LEFT JOIN sat.programas_academicos p ON e.id_programas_academicos = p.id_programas_academicos
         WHERE e.codigo_externo = $1 OR e.numero_documento = $1 OR e.id_estudiantes::text = $1
         LIMIT 1`,
        [cleanId]
      );
      if (rows.length > 0) {
        estudiante = rows[0];
      }
    } catch (dbErr) {
      console.warn("Consulta sat.estudiantes en alertas falló:", dbErr.message);
    }

    // 2. Fallback a MOCK_DATA
    if (!estudiante) {
      estudiante = MOCK_DATA.estudiantes.find(
        (e) => e.codigo.toLowerCase() === cleanId.toLowerCase() || e.documento?.toLowerCase() === cleanId.toLowerCase()
      );
    }

    const codigoFinal = estudiante ? estudiante.codigo : cleanId;
    const nombreFinal = estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : cleanId;
    const programaFinal = estudiante ? estudiante.programa : "No especificado";

    const nuevaAlerta = {
      id: `ALT-2025-${Math.floor(100 + Math.random() * 900)}`,
      codigoEstudiante: codigoFinal,
      documentoEstudiante: estudiante?.documento || "",
      nombreEstudiante: nombreFinal,
      programa: programaFinal,
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
  } catch (err) {
    next(err);
  }
<<<<<<< HEAD

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
=======
>>>>>>> 309929b (Cambios)
});

export default router;

