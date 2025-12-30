const router = require('express').Router();
const { validateRequest } = require('../middlewares/validate');
const { verifyToken } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const SystemConfig = require('../models/SystemConfig');
const {
  createOrderCheckout,
  getPaymentStatus,
  handleWebhook,
  createMercadoPagoCheckout,
  handleMercadoPagoWebhook,
  getUserPayments,
  getSellerPayments,
  getMobbexConnectUrl,
  getMobbexCredentials,
  completeMockPayment
} = require('../controllers/payment.controller');

router.get('/config', async (req, res) => {
  try {
    const cfg = await SystemConfig.findOne({}).lean();
    const gateways = (cfg && cfg.paymentGateways) || {};
    const mobbexCfg = gateways.mobbex;
    const mpCfg = gateways.mercadopago;

    const mobbexEnabled = !mobbexCfg || typeof mobbexCfg !== 'object' || mobbexCfg.enabled !== false;
    const mercadopagoEnabled = !mpCfg || typeof mpCfg !== 'object' || mpCfg.enabled !== false;

    const publicConfig = {
      mobbex: { enabled: mobbexEnabled },
      mercadopago: { enabled: mercadopagoEnabled }
    };

    return successResponse(res, publicConfig, 'Configuración de métodos de pago obtenida exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener configuración de métodos de pago', 500, error.message);
  }
});

/**
 * @route POST /api/payments/checkout
 * @desc Crear un checkout para un pedido
 * @access Private
 */
router.post('/checkout', verifyToken, validateRequest('createCheckout'), createOrderCheckout);

/**
 * @route POST /api/payments/mercadopago/checkout
 * @desc Crear preferencias de pago de Mercado Pago para un carrito (multitienda)
 * @access Private
 */
router.post('/mercadopago/checkout', verifyToken, validateRequest('createCheckout'), createMercadoPagoCheckout);

/**
 * @route GET /api/payments/status/:id
 * @desc Verificar el estado de un pago
 * @access Private
 */
router.get('/status/:id', verifyToken, getPaymentStatus);

/**
 * @route GET /api/payments/history
 * @desc Obtener historial de pagos del usuario
 * @access Private
 */
router.get('/history', verifyToken, getUserPayments);

/**
 * @route GET /api/payments/seller/history
 * @desc Obtener historial de pagos de la tienda del usuario autenticado (vendedor)
 * @access Private
 */
router.get('/seller/history', verifyToken, getSellerPayments);

/**
 * @route POST /api/payments/mobbex-connect-url
 * @desc Obtener URL de conexión Dev Connect de Mobbex
 * @access Private
 */
router.post('/mobbex-connect-url', verifyToken, getMobbexConnectUrl);

/**
 * @route GET /api/payments/mobbex-credentials
 * @desc Obtener credenciales de Mobbex usando Connect_ID
 * @access Private
 */
router.get('/mobbex-credentials', verifyToken, getMobbexCredentials);

/**
 * @route POST /api/payments/mock-complete/:paymentId
 * @desc Simular la finalización exitosa de un pago mock
 * @access Public (para testing)
 */
router.post('/mock-complete/:paymentId', completeMockPayment);

/**
 * @route POST /api/payments/webhook
 * @desc Endpoint para recibir webhooks de Mobbex
 * @access Public
 */
router.post('/webhook', handleWebhook);

/**
 * @route POST /api/payments/mercadopago/webhook
 * @desc Endpoint para recibir webhooks de Mercado Pago
 * @access Public
 */
router.post('/mercadopago/webhook', handleMercadoPagoWebhook);

module.exports = router;
