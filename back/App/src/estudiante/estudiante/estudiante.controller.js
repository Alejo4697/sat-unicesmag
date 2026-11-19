import * as estudianteService from "./estudiante.service.js";

/**
 * Controlador de Estudiante (Portal OTP y Encuesta)
 */
export async function getInstrumento(req, res, next) {
  try {
    const data = await estudianteService.obtenerInstrumento();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function consultarCorreo(req, res, next) {
  try {
    const data = await estudianteService.consultarCorreo(req.query.documento);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function solicitarOtp(req, res, next) {
  try {
    const data = await estudianteService.solicitarOtp(req.body, req.ip);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function verificarOtp(req, res, next) {
  try {
    const ip = req.ip || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || "SAT Portal Estudiante";
    const data = await estudianteService.verificarOtp(req.body, ip, userAgent);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getEstado(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.codigo || req.headers["x-user-id"];
    const data = await estudianteService.obtenerEstado(userId);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function guardarEncuesta(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.codigo || req.headers["x-user-id"];
    const data = await estudianteService.guardarEncuesta(userId, req.body.respuestas);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
