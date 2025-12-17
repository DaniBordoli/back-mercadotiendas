const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const campaignApplicationController = require('../controllers/campaignApplication.controller');
const { verifyToken } = require('../middlewares/auth');

// POST /api/applications/campaign/:campaignId - Aplicar a una campaña (requiere autenticación)
router.post('/campaign/:campaignId', verifyToken, [
  
  check('socialMediaLinks', 'Los enlaces de redes sociales deben ser un array').optional().isArray(),
  check('milestones', 'Los hitos deben ser un array').optional().isArray(),
  check('totalAmount', 'El monto total debe ser numérico').optional().isNumeric()
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

// DELETE /api/applications/:id - Eliminar una aplicación (dueño o solicitante)
router.delete('/:id', verifyToken, campaignApplicationController.deleteApplication);

// POST /api/applications/campaign/:campaignId/draft - Guardar borrador de aplicación (requiere autenticación)
router.post('/campaign/:campaignId/draft', verifyToken, [
  check('socialMediaLinks').optional().isArray(),
  check('milestones').optional().isArray(),
  check('totalAmount').optional().isNumeric()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  campaignApplicationController.saveDraftApplication(req, res);
});

// POST /api/applications/:appId/milestone/:milestoneId/submit - Enviar hito (requiere autenticación, rol influencer)
router.post('/:appId/milestone/:milestoneId/submit', verifyToken, campaignApplicationController.submitMilestone);

// POST /api/applications/:appId/milestone/:milestoneId/review - Revisar hito (requiere autenticación, rol vendedor)
router.post('/:appId/milestone/:milestoneId/review', verifyToken, campaignApplicationController.reviewMilestone);

module.exports = router;
