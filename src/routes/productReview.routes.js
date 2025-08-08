const express = require('express');
const router = express.Router();
const { createReview, getProductReviews, deleteReview } = require('../controllers/productReview.controller');
const { verifyToken } = require('../middlewares/auth');
const { validateRequest } = require('../middlewares/validate');

// Crear una nueva reseña (requiere autenticación)
router.post('/', verifyToken, validateRequest('createReview'), createReview);

// Obtener reseñas de un producto (público)
router.get('/product/:productId', getProductReviews);

// Eliminar una reseña (requiere autenticación y ser el autor)
router.delete('/:reviewId', verifyToken, deleteReview);


module.exports = router;
