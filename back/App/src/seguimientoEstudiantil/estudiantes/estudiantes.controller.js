import * as estudiantesService from "./estudiantes.service.js";

/**
 * Controlador de Seguimiento Estudiantil (Ficha 360°)
 */
export async function getEstudiantes(req, res, next) {
  try {
    const data = await estudiantesService.buscarEstudiantes(req.query.q, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getEstudianteById(req, res, next) {
  try {
    const data = await estudiantesService.obtenerFichaEstudiante(req.params.id, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getTimeline(req, res, next) {
  try {
    const data = await estudiantesService.obtenerTimelineEstudiante(req.params.id, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
