import * as caracterizacionService from "./caracterizacion.service.js";

/**
 * Controlador de Caracterización
 */
export async function getEncuesta(req, res, next) {
  try {
    const data = await caracterizacionService.obtenerEncuesta();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateEncuesta(req, res, next) {
  try {
    const data = await caracterizacionService.actualizarEncuesta(req.params.id, req.body, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getPreguntas(req, res, next) {
  try {
    const data = await caracterizacionService.obtenerPreguntas();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createPregunta(req, res, next) {
  try {
    const data = await caracterizacionService.crearPregunta(req.body, req.user);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function updatePregunta(req, res, next) {
  try {
    const data = await caracterizacionService.modificarPregunta(req.params.id, req.body, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function togglePregunta(req, res, next) {
  try {
    const data = await caracterizacionService.togglePregunta(req.params.id, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function deletePregunta(req, res, next) {
  try {
    const data = await caracterizacionService.eliminarPregunta(req.params.id, req.user);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getInstrumento(req, res, next) {
  try {
    const data = await caracterizacionService.obtenerInstrumento();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getEstudianteInfo(req, res, next) {
  try {
    const data = await caracterizacionService.obtenerEstudianteInfo(req.params.codigo);
    res.json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

export async function getHistorialEstudiante(req, res, next) {
  try {
    const data = await caracterizacionService.obtenerHistorialEstudiante(req.params.codigo);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function submitEncuesta(req, res, next) {
  try {
    const data = await caracterizacionService.enviarEncuesta(req.body, req.user);
    res.status(201).json(data);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}
