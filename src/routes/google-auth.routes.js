const express = require('express');
const router = express.Router();
const { verifyGoogleToken } = require('../controllers/google-auth.controller');

// Ruta para verificar token de Google y generar token JWT
router.post('/verify-token', verifyGoogleToken);

module.exports = router;
