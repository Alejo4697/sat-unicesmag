import * as dashboardService from "./dashboard.service.js";

/**
 * Controlador de Monitoreo / Dashboard
 */
export async function getDashboard(req, res, next) {
  try {
    const data = await dashboardService.obtenerDashboard(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getNotificaciones(req, res, next) {
  try {
    const data = await dashboardService.obtenerNotificaciones(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getResultadosCaracterizacion(req, res, next) {
  try {
    const data = await dashboardService.obtenerResultadosCaracterizacion(req.query, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getRiesgoDimensiones(req, res, next) {
  try {
    const data = await dashboardService.obtenerRiesgoDimensiones(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
