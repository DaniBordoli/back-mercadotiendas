const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const { verifyToken } = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const influencerController = require('../controllers/influencerController');

/**
 * @route   POST /api/users/become-influencer
 * @desc    Procesar solicitud para convertirse en influencer
 * @access  Private
 */
router.post('/become-influencer', 
  verifyToken,
  [
    check('niche', 'El nicho es obligatorio').not().isEmpty(),
    check('bio', 'La biografía es obligatoria').not().isEmpty(),
    check('socialMedia', 'Debe incluir al menos una red social').isArray({ min: 1 }),
    check('socialMedia.*.platform', 'La plataforma es obligatoria').not().isEmpty(),
    check('socialMedia.*.username', 'El nombre de usuario es obligatorio').not().isEmpty(),
    check('socialMedia.*.followers', 'El número de seguidores debe ser un número').optional().isNumeric()
  ],
  influencerController.applyToBecomeInfluencer
);

/**
 * @route   GET /api/users/influencer-profile
 * @desc    Obtener perfil de influencer del usuario autenticado
 * @access  Private
 */
router.get('/influencer-profile', 
  verifyToken, 
  influencerController.getInfluencerProfile
);

/**
 * @route   PUT /api/users/influencer-profile
 * @desc    Actualizar perfil de influencer
 * @access  Private
 */
router.put('/influencer-profile', 
  verifyToken,
  [
    check('niche', 'El nicho es obligatorio').optional().not().isEmpty(),
    check('bio', 'La biografía es obligatoria').optional().not().isEmpty(),
    check('socialMedia', 'Debe incluir al menos una red social').optional().isArray({ min: 1 }),
    check('socialMedia.*.platform', 'La plataforma es obligatoria').optional().not().isEmpty(),
    check('socialMedia.*.username', 'El nombre de usuario es obligatorio').optional().not().isEmpty(),
    check('socialMedia.*.followers', 'El número de seguidores debe ser un número').optional().isNumeric()
  ],
  influencerController.updateInfluencerProfile
);

// Rutas de administrador

/**
 * @route   GET /api/admin/influencer/applications
 * @desc    Listar todas las solicitudes de influencer
 * @access  Private/Admin
 */
router.get('/admin/influencer/applications', 
  verifyToken, 
  admin, 
  influencerController.listInfluencerApplications
);

/**
 * @route   PUT /api/admin/influencer/:id/approve
 * @desc    Aprobar solicitud de influencer
 * @access  Private/Admin
 */
router.put('/admin/influencer/:id/approve', 
  verifyToken, 
  admin, 
  influencerController.approveInfluencerApplication
);

/**
 * @route   PUT /api/admin/influencer/:id/reject
 * @desc    Rechazar solicitud de influencer
 * @access  Private/Admin
 */
router.put('/admin/influencer/:id/reject', 
  verifyToken, 
  admin, 
  influencerController.rejectInfluencerApplication
);

module.exports = router;
