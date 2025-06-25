const express = require('express');
const router = express.Router();
const { createShop, getShop, updateShop, deleteShop, updateShopTemplate, getShopTemplate, getMyShop, updateShopLogo } = require('../controllers/shop.controller');
const { verifyToken } = require('../middlewares/auth');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Obtener mi tienda
router.get('/me', getMyShop);

router.put('/template', updateShopTemplate);

router.get('/template', getShopTemplate);

// Subir logo de la tienda
router.put('/logo', updateShopLogo);

// Crear tienda
router.post('/', createShop);

// Obtener tienda por ID
router.get('/:id', getShop);

// Actualizar tienda
router.put('/:id', updateShop);

// Eliminar tienda
router.delete('/:id', deleteShop);

module.exports = router;
