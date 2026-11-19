import * as administracionService from "./administracion.service.js";

/**
 * Controlador de Administración
 */
export async function getUsuarios(req, res, next) {
  try {
    const data = await administracionService.buscarUsuarios(req.query.q, req.query.tipo);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getProgramas(req, res, next) {
  try {
    const data = await administracionService.listarProgramas();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export function getCargos(req, res) {
  res.json(administracionService.listarCargos());
}

export async function getLineasAccion(req, res, next) {
  try {
    const data = await administracionService.listarLineasAccion();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function gestionarAcceso(req, res, next) {
  try {
    const data = await administracionService.gestionarAccesoUsuario(req.body);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function toggleEstado(req, res, next) {
  try {
    const data = await administracionService.toggleEstadoUsuario(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const data = await administracionService.resetPasswordUsuario(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getEstadoSincronizacion(req, res, next) {
  try {
    const data = await administracionService.obtenerEstadoSincronizacion();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createUsuario(req, res, next) {
  try {
    const data = await administracionService.crearUsuario(req.body);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function deleteUsuario(req, res, next) {
  try {
    const data = await administracionService.eliminarUsuario(req.params.id);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getUmbralesRiesgo(req, res, next) {
  try {
    const data = await administracionService.obtenerUmbralesRiesgo();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateUmbralesRiesgo(req, res, next) {
  try {
    const data = await administracionService.actualizarUmbralesRiesgo(req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function sincronizar(req, res, next) {
  try {
    const resultado = await administracionService.ejecutarSinc();
    res.json({
      ok: true,
      estudiantesSincronizados: resultado.estudiantes,
      totalProcesados: resultado.totalProcesados,
      calificaciones: resultado.calificaciones,
      facultades: resultado.facultades,
      docentes: resultado.docentes,
      duracionSegundos: resultado.duracionSegundos,
      mensaje: `Sincronización exitosa: ${resultado.estudiantes} estudiantes, ${resultado.docentes || 0} docentes, ${resultado.facultades || 0} facultades y ${resultado.calificaciones} calificaciones procesadas en ${resultado.duracionSegundos}s.`
    });
  } catch (err) {
    console.error("Error en endpoint /sincronizar:", err);
    res.status(500).json({
      ok: false,
      error: "Error durante la sincronización institucional",
      detalle: err.message
    });
  }
}

export async function getMatrizPermisos(req, res, next) {
  try {
    const data = await administracionService.obtenerMatrizPermisos();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateMatrizPermisos(req, res, next) {
  try {
    const { modulo, rol, permitido } = req.body || {};
    const data = await administracionService.actualizarPermisoModulo(modulo, rol, permitido);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
