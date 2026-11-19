import * as remisionesService from "./remisiones.service.js";

/**
 * Controlador de Remisiones
 */
export async function searchEstudiante(req, res, next) {
  try {
    const resultados = await remisionesService.buscarEstudiante(req.query.q, req.user);
    res.json(resultados);
  } catch (err) {
    next(err);
  }
}

export async function getRemisiones(req, res, next) {
  try {
    const lista = await remisionesService.listarRemisiones(req.user);
    res.json(lista);
  } catch (err) {
    next(err);
  }
}

export async function getAreas(req, res, next) {
  try {
    const areas = await remisionesService.listarAreas();
    res.json(areas);
  } catch (err) {
    next(err);
  }
}

export async function getEstados(req, res, next) {
  try {
    const estados = await remisionesService.listarEstados();
    res.json(estados);
  } catch (err) {
    next(err);
  }
}

export async function getRutas(req, res, next) {
  try {
    const rutas = await remisionesService.listarRutas();
    res.json(rutas);
  } catch (err) {
    next(err);
  }
}

export async function createRemision(req, res, next) {
  try {
    const nueva = await remisionesService.registrarRemision(req.body, req.user);
    res.status(201).json(nueva);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function updateRemision(req, res, next) {
  try {
    const resultado = await remisionesService.actualizarEstado(req.params.id, req.body, req.user);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
