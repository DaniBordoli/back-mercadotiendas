const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const campaignApplicationController = require('../controllers/campaignApplication.controller');
const { verifyToken } = require('../middlewares/auth');

// POST /api/applications/campaign/:campaignId - Aplicar a una campaña (requiere autenticación)
router.post('/campaign/:campaignId', verifyToken, [
  check('message', 'El mensaje es obligatorio').not().isEmpty(),
  check('socialMediaLinks', 'Los enlaces de redes sociales deben ser un array').isArray()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  campaignApplicationController.applyToCampaign(req, res);
});

// GET /api/applications/campaign/:campaignId - Obtener todas las aplicaciones de una campaña (requiere autenticación y ser dueño de la tienda)
router.get('/campaign/:campaignId', verifyToken, campaignApplicationController.getCampaignApplications);

// GET /api/applications/:id - Obtener una aplicación específica por ID (requiere autenticación y ser dueño o aplicante)
router.get('/:id', verifyToken, campaignApplicationController.getApplicationById);

// PATCH /api/applications/:id/status - Actualizar estado de una aplicación (requiere autenticación y ser dueño de la tienda)
router.patch('/:id/status', verifyToken, campaignApplicationController.updateApplicationStatus);

// GET /api/applications/user/me - Obtener todas las aplicaciones del usuario actual (requiere autenticación)
router.get('/user/me', verifyToken, campaignApplicationController.getUserApplications);

module.exports = router;
