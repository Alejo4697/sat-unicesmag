import * as alertasService from "./alertas.service.js";

/**
 * Controlador de Alertas Tempranas
 */
export async function getAlertas(req, res, next) {
  try {
    const alertas = await alertasService.listarAlertas(req.user);
    res.json(alertas);
  } catch (err) {
    next(err);
  }
}

export async function createAlerta(req, res, next) {
  try {
    const nuevaAlerta = await alertasService.registrarAlertaManual(req.body, req.user);
    res.status(201).json(nuevaAlerta);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
