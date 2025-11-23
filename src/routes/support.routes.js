const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth');
const { createSupportTicket } = require('../controllers/support.controller');

// Límite de peticiones (máx 3 cada 5 minutos por IP)
const supportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de soporte. Por favor, intentá nuevamente más tarde.'
  }
});

// Configuración de almacenamiento en memoria para adjuntos (hasta 10MB totales, 5 archivos máx)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB por archivo (mismo límite usado en otras rutas)
  },
});

// Ruta: POST /api/support/ticket
router.post('/ticket', supportLimiter, verifyToken, upload.array('attachments', 5), createSupportTicket);

module.exports = router;