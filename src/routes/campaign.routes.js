const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const campaignController = require('../controllers/campaign.controller');
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');

// GET /api/campaigns - Obtener todas las campañas
router.get('/', campaignController.getAllCampaigns);

// GET /api/campaigns/admin/summary - Resumen de campañas (admin)
router.get('/admin/summary', verifyToken, requireAdmin, campaignController.getAdminCampaignsSummary);

// Administración de campañas (admin)
router.get('/admin', verifyToken, requireAdmin, campaignController.listAdminCampaigns);
router.patch('/admin/:id/state', verifyToken, requireAdmin, campaignController.updateCampaignStateAdmin);

// GET /api/campaigns/:id - Obtener una campaña por ID
router.get('/:id', campaignController.getCampaignById);

// POST /api/campaigns - Crear una nueva campaña (requiere autenticación)
router.post('/', verifyToken, [
  check('name', 'El nombre es obligatorio').not().isEmpty(),
  check('description', 'La descripción es obligatoria').not().isEmpty(),
  check('objectives', 'Debes seleccionar al menos un objetivo').isArray({ min: 1 }),
  check('startDate', 'La fecha de inicio es obligatoria').isISO8601(),
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
router.get('/shop/:shopId', verifyToken, campaignController.getCampaignsByShop);

// PATCH /api/campaigns/:id/step2 - Guardar paso 2 (productos)
router.patch('/:id/step2', verifyToken, campaignController.updateCampaign);

// PATCH /api/campaigns/:id/step3 - Guardar paso 3 (milestones y KPIs)
router.patch('/:id/step3', verifyToken, campaignController.updateCampaign);

// PATCH /api/campaigns/:id/status - Actualizar estado de una campaña (requiere autenticación)
router.patch('/:id/status', verifyToken, campaignController.updateCampaignStatus);

// POST /api/campaigns/:id/invite - Invitar a influencer a campaña
router.post('/:id/invite', verifyToken, campaignController.inviteInfluencer);

module.exports = router;
