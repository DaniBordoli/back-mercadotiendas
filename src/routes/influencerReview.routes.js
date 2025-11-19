const express = require('express');
const router = express.Router();
const admin = require('../middlewares/admin');
const ctrl = require('../controllers/influencerReview.controller');
const { verifyToken } = require('../middlewares/auth');

// Crear reseña
router.post('/', verifyToken, ctrl.createReview);

// Editar reseña
router.put('/:id', verifyToken, ctrl.editReview);

// Responder reseña (influencer)
router.post('/:id/reply', verifyToken, ctrl.replyReview);

// Reportar reseña
router.post('/:id/report', verifyToken, ctrl.reportReview);

// ----- Rutas de administración -----
// Obtener reseñas reportadas
router.get('/admin/reported', verifyToken, admin, ctrl.listReportedReviews);

// Cambiar estado de reseña (publicar/ocultar)
router.put('/admin/:id/status', verifyToken, admin, ctrl.updateReviewStatus);

// Listar reseñas públicas de un influencer
router.get('/influencer/:influencerId', ctrl.getInfluencerReviews);

module.exports = router;