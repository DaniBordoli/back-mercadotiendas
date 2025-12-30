const express = require('express');
const router = express.Router();
const { createShop, getShop, updateShop, deleteShop, updateShopTemplate, getShopTemplate, getMyShop, updateShopLogo, updateShopBanner, getPublicShop, updateMobbexCredentials, getMercadoPagoConnectUrl, handleMercadoPagoCallback, getMercadoPagoCredentials, deleteMercadoPagoCredentials, checkShopNameAvailability, followShop, getAdminShopsSummary, listAdminShops, updateShopStateAdmin } = require('../controllers/shop.controller');
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');

// Ruta pública para obtener tienda por ID (sin autenticación)
router.get('/public/:id', getPublicShop);

router.get('/check-name', checkShopNameAvailability);

router.get('/mercadopago/callback', handleMercadoPagoCallback);

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Resumen de tiendas (admin)
router.get('/admin/summary', requireAdmin, getAdminShopsSummary);

// Administración de tiendas (admin)
router.get('/admin', requireAdmin, listAdminShops);
router.patch('/admin/:id/state', requireAdmin, updateShopStateAdmin);

// Administración de tiendas
router.get('/admin', requireAdmin, listAdminShops);
router.patch('/admin/:id/state', requireAdmin, updateShopStateAdmin);

// Obtener mi tienda
router.get('/me', getMyShop);

router.put('/template', updateShopTemplate);

router.get('/template', getShopTemplate);

router.put('/logo', updateShopLogo);
router.put('/logo', updateShopLogo);
router.put('/banner', updateShopBanner);

router.post('/', createShop);

// Obtener tienda por ID
router.get('/:id', getShop);

router.put('/:id', updateShop);

router.delete('/:id', deleteShop);

router.put('/:id/mobbex-credentials', updateMobbexCredentials);

router.get('/:id/mercadopago/connect-url', getMercadoPagoConnectUrl);
router.get('/:id/mercadopago/credentials', getMercadoPagoCredentials);
router.delete('/:id/mercadopago/credentials', deleteMercadoPagoCredentials);

router.post('/:id/follow', followShop);

module.exports = router;
