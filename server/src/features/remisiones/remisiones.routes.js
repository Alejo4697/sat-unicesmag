/* ==========================================================================
   Feature: Remisiones (RQF09/RQF10 - incluye escalado 48h - RQF17/RQF18)
   GET   /api/remisiones          -> lista
   GET   /api/remisiones/areas    -> catálogo de áreas de destino ACTIVAS
   GET   /api/remisiones/estados  -> catálogo de estados de remisión ACTIVOS
   POST  /api/remisiones          -> crear remisión (RQF17)
   PATCH /api/remisiones/:id      -> actualizar estado / recomendaciones (RQF18)
   ==========================================================================
   Las remisiones en sí siguen en MOCK_DATA (no migradas). Lo único que se
   consulta contra PostgreSQL (schema `sat`, vía shared/db/pool.js) son los
   catálogos administrables desde Administración:
     - /areas   <- sat.dependencias (tipo 'AREA_ATENCION', activo=true)
     - /estados <- sat.estados_remision (activo=true)
   El panel de Remisiones ya no trae esas listas hardcodeadas.
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("remisiones"));

router.get("/", (req, res) => {
  res.json(MOCK_DATA.remisiones);
});

// Áreas de destino que hoy pueden elegirse al generar una remisión (solo
// activas). Las que se inhabiliten desde Administración dejan de aparecer
// acá, pero las remisiones históricas que ya las usaban no cambian.
router.get("/areas", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_dependencias AS id, nombre,
              es_confidencialidad_especial AS "esConfidencialidad"
       FROM sat.dependencias
       WHERE tipo = 'AREA_ATENCION' AND activo = true
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Estados a los que el modal "Gestionar Estado" puede mover una remisión
// (solo activos, en su orden de flujo). El cliente agrega aparte el estado
// actual del registro si quedó inhabilitado.
router.get("/estados", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_estados_remision AS id, nombre, orden, es_final AS "esFinal"
       FROM sat.estados_remision
       WHERE activo = true
       ORDER BY orden`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
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
    fechaRemision: new Date().toISOString(),
    estado: "Generada",
    escalado48h: nivelRiesgo === "Alto" || nivelRiesgo === "Muy Alto",
    recomendacionesAula: ""
  };

  MOCK_DATA.remisiones.unshift(nueva);
  res.status(201).json(nueva);
});

// Espeja guardarEstadoRemision() del modal "Gestionar Estado".
router.patch("/:id", async (req, res, next) => {
  const remision = MOCK_DATA.remisiones.find((r) => r.id === req.params.id);
  if (!remision) {
    return res.status(404).json({ error: "Remisión no encontrada." });
  }

  const { estado, recomendacionesAula } = req.body;

  // Solo se valida contra el catálogo cuando el estado realmente cambia:
  // así una remisión que ya está en un estado luego inhabilitado se puede
  // seguir guardando (p. ej. para editar solo las recomendaciones).
  if (estado && estado !== remision.estado) {
    try {
      const { rows } = await query(
        `SELECT nombre FROM sat.estados_remision WHERE activo = true ORDER BY orden`
      );
      const validos = rows.map((r) => r.nombre);
      if (!validos.includes(estado)) {
        return res.status(400).json({
          error: `Estado inválido o inhabilitado. Use uno de: ${validos.join(", ")}.`
        });
      }
    } catch (err) {
      return next(err);
    }
  }

  if (estado) remision.estado = estado;
  if (recomendacionesAula !== undefined) remision.recomendacionesAula = recomendacionesAula;

  res.json(remision);
});

export default router;
