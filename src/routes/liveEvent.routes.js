const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const liveEventController = require('../controllers/liveEvent.controller');
const { verifyToken } = require('../middlewares/auth');
const isInfluencer = require('../middlewares/isInfluencer');

// GET /api/live-events - Obtener eventos
router.get('/', verifyToken, isInfluencer, liveEventController.getLiveEvents);

// GET /api/live-events/public - Obtener eventos publicados (público)
router.get('/public', liveEventController.getPublicLiveEvents);

// PUT /api/live-events/:id/highlight - Actualizar producto destacado (influencer autenticado)
router.put('/:id/highlight', verifyToken, isInfluencer, liveEventController.updateHighlightedProduct);

// GET /api/live-events/:id/highlight - Obtener producto destacado (público)
router.get('/:id/highlight', liveEventController.getHighlightedProduct);

// DELETE /api/live-events/:id - Eliminar evento en vivo (influencer autenticado)
router.delete('/:id', verifyToken, isInfluencer, liveEventController.deleteLiveEvent);

// PUT /api/live-events/:id - Actualizar evento (influencer autenticado)
router.put('/:id',
  verifyToken,
  isInfluencer,
  [
    check('title').optional().isLength({ max: 120 }).withMessage('Máximo 120 caracteres'),
    check('description').optional().isLength({ max: 500 }).withMessage('Máximo 500 caracteres'),
    check('date').optional().isISO8601(),
    check('time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    check('status').optional().isIn(['draft', 'published', 'live', 'finished']),
    check('campaign').optional().isMongoId(),
    check('products').optional().isArray(),
    check('socialAccounts').optional().isArray(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    liveEventController.updateLiveEvent(req, res);
  }
);

// Aggregated dashboard endpoints (declarar ANTES de rutas con ":id" para evitar colisiones)
router.get('/summary', verifyToken, isInfluencer, liveEventController.getAggregatedSummary);
router.get('/funnel', verifyToken, isInfluencer, liveEventController.getAggregatedFunnel);
router.get('/audience-series', verifyToken, isInfluencer, liveEventController.getAggregatedAudienceSeries);
// GET /api/live-events/campaign-summary - Resumen de ingresos por campaña
router.get('/campaign-summary', verifyToken, isInfluencer, liveEventController.getCampaignSummary);

// GET /api/live-events/:id - Obtener un evento específico (público con filtrado por estado)
router.get('/:id', liveEventController.getLiveEvent);

// GET /api/live-events/:id/metrics - Obtener métricas del evento (público)
router.get('/:id/metrics', liveEventController.getMetrics);

// GET /api/live-events/:id/product-metrics - Obtener métricas por producto destacado (público)
router.get('/:id/product-metrics', liveEventController.getProductMetrics);

// PATCH /api/live-events/:id/metrics - Actualizar métricas del evento (sin auth para permitir tracking)
router.patch('/:id/metrics', liveEventController.updateMetrics);

// Chat del evento
router.get('/:id/chat', liveEventController.getChatMessages);
router.post('/:id/chat', verifyToken, liveEventController.createChatMessage);
router.delete('/:id/chat/:messageId', verifyToken, liveEventController.deleteChatMessage);

// POST /api/live-events/:id/viewers-snapshot - Registrar snapshot de espectadores (sin auth para tracking)
router.post('/:id/viewers-snapshot', liveEventController.createViewerSnapshot);

// GET /api/live-events/:id/viewer-series - Obtener serie de espectadores
router.get('/:id/viewer-series', liveEventController.getViewerSeries);

// POST /api/live-events - Crear un nuevo evento en vivo (influencer autenticado)
router.post('/',
  verifyToken,
  isInfluencer,
  [
    check('title', 'El título es obligatorio').not().isEmpty().bail().isLength({ max: 120 }).withMessage('Máximo 120 caracteres'),
    check('description').optional().isLength({ max: 500 }).withMessage('Máximo 500 caracteres'),
    check('date', 'La fecha es obligatoria').isISO8601(),
    check('time', 'La hora es obligatoria').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    check('status').optional().isIn(['draft', 'published']),
    check('campaign').optional().isMongoId(),
    check('products').optional().isArray(),
    check('socialAccounts').optional().isArray()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    liveEventController.createLiveEvent(req, res);
  }
);



module.exports = router;
