export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error("[ServerError]", err);
  const status = Number(err.status) || 500;
  // Solo se exponen mensajes específicos si corresponden a errores operacionales controlados (4xx).
  // Los errores de base de datos o fallos 500 jamás exponen detalles técnicos, esquemas ni tablas.
  const mensajeSeguro = status < 500 && err.message
    ? err.message
    : "Ocurrió un error interno en el servidor. Por favor comuníquese con el soporte técnico.";

  res.status(status).json({
    error: mensajeSeguro
  });
}
