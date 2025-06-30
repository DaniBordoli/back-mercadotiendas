const express = require('express');
const router = express.Router();
const { getShopInstitutional, updateShopInstitutional, getShopInstitutionalByShopId } = require('../controllers/shopInstitutional.controller');
const { verifyToken } = require('../middlewares/auth');

// Rutas que requieren autenticación
router.use(verifyToken);

// Obtener información institucional de mi tienda
router.get('/me', getShopInstitutional);

// Actualizar información institucional de mi tienda
router.put('/me', updateShopInstitutional);

// Obtener información institucional por ID de tienda (para vistas públicas)
router.get('/shop/:shopId', getShopInstitutionalByShopId);

module.exports = router;
