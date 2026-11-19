import * as authService from "./auth.service.js";

/**
 * Controlador de Autenticación
 */
export async function getUsuarios(req, res, next) {
  try {
    const usuarios = await authService.listarUsuarios();
    res.json(usuarios);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const ip = req.ip || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || "SAT Web Client";
    const resultado = await authService.login(req.body, ip, userAgent);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const resultado = await authService.logout(req.headers.authorization);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, nuevoPassword } = req.body;
    const resultado = await authService.cambiarPassword(req.user, passwordActual, nuevoPassword);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function solicitarRecuperacion(req, res, next) {
  try {
    const resultado = await authService.solicitarRecuperacion(req.body.email);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function restablecerPassword(req, res, next) {
  try {
    const { email, codigo, nuevoPassword } = req.body;
    const resultado = await authService.restablecerPassword(email, codigo, nuevoPassword);
    res.json(resultado);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export function getMe(req, res) {
  res.json(req.user);
}
