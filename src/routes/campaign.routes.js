const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const campaignController = require('../controllers/campaign.controller');
const { verifyToken } = require('../middlewares/auth');

// GET /api/campaigns - Obtener todas las campañas
router.get('/', campaignController.getAllCampaigns);

// GET /api/campaigns/:id - Obtener una campaña por ID
router.get('/:id', campaignController.getCampaignById);

// POST /api/campaigns - Crear una nueva campaña (requiere autenticación)
router.post('/', verifyToken, [
  check('name', 'El nombre es obligatorio').not().isEmpty(),
  check('description', 'La descripción es obligatoria').not().isEmpty(),
  check('budget', 'El presupuesto es obligatorio').isNumeric(),
  check('endDate', 'La fecha de finalización es obligatoria').isISO8601(),
  check('category', 'La categoría es obligatoria').not().isEmpty()
], function(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  campaignController.createCampaign(req, res);
});

// PUT /api/campaigns/:id - Actualizar una campaña (requiere autenticación)
router.put('/:id', verifyToken, campaignController.updateCampaign);

// DELETE /api/campaigns/:id - Eliminar una campaña (requiere autenticación)
router.delete('/:id', verifyToken, campaignController.deleteCampaign);

// GET /api/campaigns/shop/:shopId - Obtener campañas por tienda
router.get('/shop/:shopId', campaignController.getCampaignsByShop);

// PATCH /api/campaigns/:id/status - Actualizar estado de una campaña (requiere autenticación)
router.patch('/:id/status', verifyToken, campaignController.updateCampaignStatus);

module.exports = router;
