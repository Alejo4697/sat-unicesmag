import * as actividadesService from "./actividades.service.js";

/**
 * Controlador de Actividades de Bienestar Institucional
 */
export async function sincronizarPerfiles(req, res, next) {
  try {
    const data = await actividadesService.sincronizarPerfilesCompletos();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function sincronizarEgresados(req, res, next) {
  try {
    const data = await actividadesService.sincronizarEgresados();
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
}

export async function sincronizarAdministrativos(req, res, next) {
  try {
    const data = await actividadesService.sincronizarAdministrativos();
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
}

export async function sincronizarInstitucional(req, res, next) {
  try {
    const data = await actividadesService.sincronizarInstitucional();
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
}

export async function getResumen(req, res, next) {
  try {
    const data = await actividadesService.obtenerResumenActividades(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
