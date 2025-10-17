const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const liveEventController = require('../controllers/liveEvent.controller');
const { verifyToken } = require('../middlewares/auth');
const isInfluencer = require('../middlewares/isInfluencer');

// GET /api/live-events - Obtener eventos
router.get('/', verifyToken, isInfluencer, liveEventController.getLiveEvents);

// PUT /api/live-events/:id/highlight - Actualizar producto destacado (influencer autenticado)
router.put('/:id/highlight', verifyToken, isInfluencer, liveEventController.updateHighlightedProduct);

// GET /api/live-events/:id/highlight - Obtener producto destacado (público)
router.get('/:id/highlight', liveEventController.getHighlightedProduct);

// DELETE /api/live-events/:id - Eliminar evento en vivo (influencer autenticado)
router.delete('/:id', verifyToken, isInfluencer, liveEventController.deleteLiveEvent);

// PUT /api/live-events/:id - Actualizar evento (influencer autenticado)
router.put('/:id', verifyToken, isInfluencer, liveEventController.updateLiveEvent);

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

// GET /api/live-events/public - Obtener eventos publicados (público)
router.get('/public', liveEventController.getPublicLiveEvents);

module.exports = router;