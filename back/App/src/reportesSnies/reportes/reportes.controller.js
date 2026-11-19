import * as reportesService from "./reportes.service.js";

/**
 * Controlador de Reportes y SNIES
 */
export async function getResumen(req, res, next) {
  try {
    const resumen = await reportesService.obtenerResumen();
    res.json(resumen);
  } catch (err) {
    next(err);
  }
}

export async function getFiltros(req, res, next) {
  try {
    const filtros = await reportesService.obtenerFiltros(req.user);
    res.json(filtros);
  } catch (err) {
    next(err);
  }
}

export async function getSnies(req, res, next) {
  try {
    const filas = await reportesService.exportarSnies(req.query, req.user);
    res.json(filas);
  } catch (err) {
    next(err);
  }
}

export async function getIntervenciones(req, res, next) {
  try {
    const filas = await reportesService.exportarIntervenciones(req.query, req.user);
    res.json(filas);
  } catch (err) {
    next(err);
  }
}

export async function getRemisiones(req, res, next) {
  try {
    const filas = await reportesService.exportarRemisiones(req.query, req.user);
    res.json(filas);
  } catch (err) {
    next(err);
  }
}
