const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../controllers/firebase-auth.controller');

// Ruta para verificar token de Firebase y generar token JWT
router.post('/verify-token', verifyFirebaseToken);

module.exports = router;
