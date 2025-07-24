const express = require('express');
const path = require('path');

/**
 * Middleware para servir archivos estáticos
 * @param {Object} app - Express app
 */
exports.setupStaticMiddleware = (app) => {
  // Configurar directorio de uploads para ser accesible públicamente
  const uploadsPath = path.join(__dirname, '../../uploads');
  app.use('/uploads', express.static(uploadsPath));
};
