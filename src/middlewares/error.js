const { errorResponse } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Errores de MongoDB
  if (err.name === 'ValidationError') {
    return errorResponse(res, 'Error de validación', 400, Object.values(err.errors).map(e => e.message));
  }

  if (err.name === 'MongoError' && err.code === 11000) {
    return errorResponse(res, 'El registro ya existe', 400);
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Token inválido', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token expirado', 401);
  }

  // Error por defecto
  return errorResponse(
    res,
    err.message || 'Error interno del servidor',
    err.status || 500
  );
};

const notFound = (req, res) => {
  return errorResponse(res, 'Ruta no encontrada', 404);
};

module.exports = {
  errorHandler,
  notFound
};
