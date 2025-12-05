const express = require('express');
const router = express.Router();
const { createShop, getShop, updateShop, deleteShop, updateShopTemplate, getShopTemplate, getMyShop, updateShopLogo, updateShopBanner, getPublicShop, updateMobbexCredentials, checkShopNameAvailability, followShop } = require('../controllers/shop.controller');
const { verifyToken } = require('../middlewares/auth');

// Ruta pública para obtener tienda por ID (sin autenticación)
router.get('/public/:id', getPublicShop);

// Ruta pública para verificar disponibilidad del nombre (sin autenticación)
router.get('/check-name', checkShopNameAvailability);

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Obtener mi tienda
router.get('/me', getMyShop);

router.put('/template', updateShopTemplate);

router.get('/template', getShopTemplate);

router.put('/logo', updateShopLogo);
router.put('/logo', updateShopLogo);
router.put('/banner', updateShopBanner);

// Crear tienda
router.post('/', createShop);

// Obtener tienda por ID
router.get('/:id', getShop);

// Actualizar tienda
router.put('/:id', updateShop);

// Eliminar tienda
router.delete('/:id', deleteShop);

// Actualizar credenciales de Mobbex para una tienda
router.put('/:id/mobbex-credentials', updateMobbexCredentials);

// Seguir/Dejar de seguir una tienda
router.post('/:id/follow', followShop);

module.exports = router;
