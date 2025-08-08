const { ProductReview } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');

// Crear una nueva reseña

const createReview = async (req, res) => {
  try {
    const { productId, comment, rating } = req.body;
    const userId = req.user.id;

    const review = new ProductReview({
      userId,
      productId,
      comment,
      rating
    });

    await review.save();
    await review.populate('userId', 'fullName name');

    // Crear respuesta con userName para compatibilidad con frontend
    const reviewResponse = {
      ...review.toObject(),
      userName: review.userId?.fullName || review.userId?.name || 'Usuario Anónimo'
    };

    successResponse(res, 'Reseña creada exitosamente', reviewResponse, 201);
  } catch (error) {
    console.error('Error creating review:', error);
    errorResponse(res, 'Error al crear la reseña', 500);
  }
};

// Obtener reseñas de un producto
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    const reviews = await ProductReview.find({ productId })
      .populate('userId', 'fullName name')
      .sort({ createdAt: -1 });

    // Asegurar que reviews es un array y transformar respuesta para incluir userName
    const reviewsArray = Array.isArray(reviews) ? reviews : [];
    const reviewsWithUserName = reviewsArray.map(review => ({
      ...review.toObject(),
      userName: review.userId?.fullName || review.userId?.name || 'Usuario Anónimo'
    }));

    successResponse(res, 'Reseñas obtenidas exitosamente', reviewsWithUserName);
  } catch (error) {
    console.error('Error getting reviews:', error);
    errorResponse(res, 'Error al obtener las reseñas', 500);
  }
};

// Eliminar una reseña (solo el autor puede eliminarla)
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    const review = await ProductReview.findOne({ _id: reviewId, userId });

    if (!review) {
      return errorResponse(res, 'Reseña no encontrada o no autorizada', 404);
    }

    await ProductReview.findByIdAndDelete(reviewId);

    successResponse(res, 'Reseña eliminada exitosamente');
  } catch (error) {
    console.error('Error deleting review:', error);
    errorResponse(res, 'Error al eliminar la reseña', 500);
  }
};

module.exports = {
  createReview,
  getProductReviews,
  deleteReview
};
