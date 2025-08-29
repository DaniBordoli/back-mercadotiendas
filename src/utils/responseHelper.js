// Utilidades para respuestas HTTP estandarizadas

/**
 * Respuesta exitosa estandarizada
 * @param {Object} res - Objeto de respuesta de Express
 * @param {*} data - Datos a enviar
 * @param {string} message - Mensaje de éxito
 * @param {number} statusCode - Código de estado HTTP (por defecto 200)
 */
exports.successResponse = (res, data = null, message = 'Operación exitosa', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Respuesta de error estandarizada
 * @param {Object} res - Objeto de respuesta de Express
 * @param {string} message - Mensaje de error
 * @param {number} statusCode - Código de estado HTTP (por defecto 500)
 * @param {*} error - Detalles del error (opcional)
 */
exports.errorResponse = (res, message = 'Error interno del servidor', statusCode = 500, error = null) => {
  const response = {
    success: false,
    message
  };

  // Solo incluir detalles del error en desarrollo
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = error;
  }

  return res.status(statusCode).json(response);
};

/**
 * Respuesta de validación de errores
 * @param {Object} res - Objeto de respuesta de Express
 * @param {Array} errors - Array de errores de validación
 */
exports.validationErrorResponse = (res, errors) => {
  return res.status(400).json({
    success: false,
    message: 'Errores de validación',
    errors
  });
};

/**
 * Respuesta de no encontrado
 * @param {Object} res - Objeto de respuesta de Express
 * @param {string} message - Mensaje personalizado
 */
exports.notFoundResponse = (res, message = 'Recurso no encontrado') => {
  return res.status(404).json({
    success: false,
    message
  });
};

/**
 * Respuesta de no autorizado
 * @param {Object} res - Objeto de respuesta de Express
 * @param {string} message - Mensaje personalizado
 */
exports.unauthorizedResponse = (res, message = 'No autorizado') => {
  return res.status(401).json({
    success: false,
    message
  });
};

/**
 * Respuesta de prohibido
 * @param {Object} res - Objeto de respuesta de Express
 * @param {string} message - Mensaje personalizado
 */
exports.forbiddenResponse = (res, message = 'Acceso prohibido') => {
  return res.status(403).json({
    success: false,
    message
  });
};