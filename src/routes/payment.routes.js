const router = require('express').Router();
const { validateRequest } = require('../middlewares/validate');
const { verifyToken } = require('../middlewares/auth');
const {
  createOrderCheckout,
  getPaymentStatus,
  handleWebhook,
  getUserPayments
} = require('../controllers/payment.controller');

/**
 * @route POST /api/payments/checkout
 * @desc Crear un checkout para un pedido
 * @access Private
 */
router.post('/checkout', verifyToken, validateRequest('createCheckout'), createOrderCheckout);

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
 * @route POST /api/payments/webhook
 * @desc Endpoint para recibir webhooks de Mobbex
 * @access Public
 */
router.post('/webhook', handleWebhook);

module.exports = router;
