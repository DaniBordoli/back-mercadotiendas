const express = require('express');
const router = express.Router();
const { createReview, getProductReviews, deleteReview, voteReview } = require('../controllers/productReview.controller');
const { verifyToken } = require('../middlewares/auth');
const { validateRequest } = require('../middlewares/validate');

// Crear una nueva reseña (requiere autenticación)
router.post('/', verifyToken, validateRequest('createReview'), createReview);

// Obtener reseñas de un producto (público)
router.get('/product/:productId', getProductReviews);

// Marcar o quitar voto de utilidad (requiere autenticación)
router.patch('/:reviewId/helpful', verifyToken, voteReview);

// Responder a una reseña (solo dueño de la tienda)
router.patch('/:reviewId/reply', verifyToken, require('../controllers/productReview.controller').replyReview);

// Eliminar una reseña (requiere autenticación y ser el autor)
router.delete('/:reviewId', verifyToken, deleteReview);


module.exports = router;
