/* ==========================================================================
   Feature: Intervenciones (RQF04, RQF16, RQF19)
   GET  /api/intervenciones        -> lista (aplica RNF01 sobre casos VBG)
   GET  /api/intervenciones/tipos  -> catálogo de tipos de intervención ACTIVOS
   POST /api/intervenciones        -> registrar intervención
   ==========================================================================
   Las intervenciones en sí siguen en MOCK_DATA (no migradas). Lo único que
   se consulta contra PostgreSQL (schema `sat`, vía shared/db/pool.js) es el
   catálogo de tipos de intervención, administrable desde Administración:
     - /tipos <- sat.tipos_intervencion (activo=true)
   `tipoIntervencion` pasa a ser obligatorio al registrar (el mockup no lo
   capturaba; el diseño de BD lo exige: sat.intervenciones.id_tipos_intervencion
   es NOT NULL).
   ========================================================================== */

import { Router } from "express";
import { MOCK_DATA } from "../../shared/data/mockData.js";
import { identifyUser, requireModule } from "../../shared/middleware/requireRole.js";
import { sanitizarIntervencion } from "../../shared/security/vbg.js";
import { query } from "../../shared/db/pool.js";

const router = Router();

router.use(identifyUser, requireModule("intervenciones"));

// Tipos que hoy pueden elegirse al registrar una intervención (solo activos).
// Los que se inhabiliten desde Administración dejan de aparecer acá, pero las
// intervenciones históricas que ya los usaban no cambian.
router.get("/tipos", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id_tipos_intervencion AS id, nombre, descripcion
       FROM sat.tipos_intervencion
       WHERE activo = true
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

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
router.post("/", async (req, res, next) => {
  const { codigoEstudiante, tipoIntervencion, motivo, resumenAcuerdo, esSensibleVBG, adjuntos } = req.body;

  if (!codigoEstudiante || !tipoIntervencion || !motivo || !resumenAcuerdo) {
    return res.status(400).json({ error: "Diligencie todos los campos requeridos (incluido el tipo de intervención)." });
  }

  // El tipo debe existir y estar activo en el catálogo (sat.tipos_intervencion).
  try {
    const { rows } = await query(
      `SELECT nombre FROM sat.tipos_intervencion WHERE activo = true ORDER BY nombre`
    );
    const validos = rows.map((r) => r.nombre);
    if (!validos.includes(tipoIntervencion)) {
      return res.status(400).json({
        error: `Tipo de intervención inválido o inhabilitado. Use uno de: ${validos.join(", ")}.`
      });
    }
  } catch (err) {
    return next(err);
  }

  const nueva = {
    id: `INT-2025-${Math.floor(100 + Math.random() * 900)}`,
    codigoEstudiante,
    atendidoPor: req.user.nombre,
    cargoAtendio: req.user.cargo,
    fecha: new Date().toISOString().replace("T", " ").substring(0, 16),
    tipoIntervencion,
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
