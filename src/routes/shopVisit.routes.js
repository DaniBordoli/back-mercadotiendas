const express = require('express');
const router = express.Router();
const { createVisit, getVisitsLast24h } = require('../controllers/shopVisit.controller');
const { verifyToken } = require('../middlewares/auth');

// Registrar visita pública (autenticación opcional)
router.post('/:shopId/visits', createVisit);

// Obtener visitas últimas 24h de mi tienda (requiere autenticación)
router.get('/my-shop/visits-24h', verifyToken, getVisitsLast24h);

module.exports = router;