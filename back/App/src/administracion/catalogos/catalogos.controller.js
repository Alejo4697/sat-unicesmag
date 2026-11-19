import * as catalogosService from "./catalogos.service.js";

function handlePgError(err, nombre) {
  if (err.code === "23505") {
    err.status = 409;
    err.message = `Ya existe un elemento con el nombre "${nombre}".`;
  } else if (err.code === "22P02") {
    err.status = 404;
    err.message = "No se encontró el elemento del catálogo solicitado.";
  }
  return err;
}

// Áreas
export async function getAreas(req, res, next) {
  try {
    const rows = await catalogosService.listarAreas();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createArea(req, res, next) {
  try {
    const item = await catalogosService.crearArea(req.body);
    res.status(201).json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function updateArea(req, res, next) {
  try {
    const item = await catalogosService.actualizarArea(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function toggleArea(req, res, next) {
  try {
    const item = await catalogosService.toggleArea(req.params.id, req.body.activo);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

// Estados
export async function getEstados(req, res, next) {
  try {
    const rows = await catalogosService.listarEstados();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createEstado(req, res, next) {
  try {
    const item = await catalogosService.crearEstado(req.body);
    res.status(201).json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function updateEstado(req, res, next) {
  try {
    const item = await catalogosService.actualizarEstado(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function toggleEstado(req, res, next) {
  try {
    const item = await catalogosService.toggleEstado(req.params.id, req.body.activo);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

// Tipos de intervención
export async function getTipos(req, res, next) {
  try {
    const rows = await catalogosService.listarTipos();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createTipo(req, res, next) {
  try {
    const item = await catalogosService.crearTipo(req.body);
    res.status(201).json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function updateTipo(req, res, next) {
  try {
    const item = await catalogosService.actualizarTipo(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err, req.body.nombre);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}

export async function toggleTipo(req, res, next) {
  try {
    const item = await catalogosService.toggleTipo(req.params.id, req.body.activo);
    res.json(item);
  } catch (err) {
    const mapped = handlePgError(err);
    if (mapped.status) return res.status(mapped.status).json({ error: mapped.message });
    next(mapped);
  }
}
