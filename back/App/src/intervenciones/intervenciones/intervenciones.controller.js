import * as intervencionesService from "./intervenciones.service.js";

/**
 * Controlador de Intervenciones
 */
export async function getTipos(req, res, next) {
  try {
    const tipos = await intervencionesService.listarTipos();
    res.json(tipos);
  } catch (err) {
    next(err);
  }
}

export async function getIntervenciones(req, res, next) {
  try {
    const intervenciones = await intervencionesService.listarIntervenciones(req.query.codigoEstudiante, req.user);
    res.json(intervenciones);
  } catch (err) {
    next(err);
  }
}

export async function createIntervencion(req, res, next) {
  try {
    const nueva = await intervencionesService.registrarIntervencion(req.body, req.user);
    res.status(201).json(nueva);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function updateIntervencion(req, res, next) {
  try {
    const resultado = await intervencionesService.actualizarEstado(req.params.id, req.body, req.user);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}
