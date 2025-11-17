const { ProductReview, Products, Shop } = require('../models');
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

    successResponse(res, reviewResponse, 'Reseña creada exitosamente', 201);
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

    successResponse(res, reviewsWithUserName, 'Reseñas obtenidas exitosamente');
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

    successResponse(res, null, 'Reseña eliminada exitosamente');
  } catch (error) {
    console.error('Error deleting review:', error);
    errorResponse(res, 'Error al eliminar la reseña', 500);
  }
};

// Registrar / actualizar voto útil (sí/no) sobre una reseña
const voteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { vote } = req.body; // 'yes' | 'no'
    const userId = req.user.id;

    if (!['yes', 'no'].includes(vote)) {
      return errorResponse(res, 'Parámetro "vote" inválido', 400);
    }

    const review = await ProductReview.findById(reviewId);
    if (!review) {
      return errorResponse(res, 'Reseña no encontrada', 404);
    }

    // Buscar si el usuario ya votó
    const existing = review.helpfulVotes.find(v => v.userId.toString() === userId);

    if (existing) {
      if (existing.vote === vote) {
        // Si es el mismo voto, eliminarlo (toggle off)
        review.helpfulVotes = review.helpfulVotes.filter(v => v.userId.toString() !== userId);
      } else {
        // Si es distinto, actualizar el voto
        existing.vote = vote;
      }
    } else {
      // Agregar nuevo voto
      review.helpfulVotes.push({ userId, vote });
    }

    await review.save();

    // Calcular conteos
    const yesVotes = review.helpfulVotes.filter(v => v.vote === 'yes').length;
    const noVotes = review.helpfulVotes.filter(v => v.vote === 'no').length;

    // Determinar el voto del usuario tras la operación
    const updated = review.helpfulVotes.find(v => v.userId.toString() === userId);

    return successResponse(res, {
      reviewId: review._id,
      yesVotes,
      noVotes,
      userVote: updated ? updated.vote : null,
    }, 'Voto procesado correctamente');
  } catch (error) {
    console.error('Error procesando voto de reseña:', error);
    return errorResponse(res, 'Error al procesar el voto', 500);
  }
};

// Responder reseña (solo dueño de tienda)
const replyReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text || !text.trim()) {
      return errorResponse(res, 'El texto de la respuesta es obligatorio', 400);
    }

    // Obtener la reseña y el producto asociado
    const review = await ProductReview.findById(reviewId);
    if (!review) {
      return errorResponse(res, 'Reseña no encontrada', 404);
    }

    const product = await Products.findById(review.productId).populate('shop');
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }

    // Verificar que el usuario sea dueño de la tienda del producto
    const shop = product.shop;
    if (!shop || shop.owner.toString() !== userId) {
      return errorResponse(res, 'No estás autorizado para responder esta reseña', 403);
    }

    // Guardar la respuesta en el campo reply
    review.reply = {
      userId,
      text: text.trim(),
      createdAt: new Date()
    };

    await review.save();
    await review.populate('reply.userId', 'fullName name');

    successResponse(res, review.reply, 'Respuesta registrada exitosamente');
  } catch (error) {
    console.error('Error respondiendo reseña:', error);
    errorResponse(res, 'Error al responder la reseña', 500);
  }
};

module.exports = {
  createReview,
  getProductReviews,
  deleteReview,
  voteReview,
  replyReview
};
