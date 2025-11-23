const InfluencerReview = require('../models/InfluencerReview');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const InfluencerProfile = require('../models/InfluencerProfile');
const Campaign = require('../models/Campaign');
const { successResponse, errorResponse } = require('../utils/response');
const mongoose = require('mongoose');
const Filter = require('bad-words');

// Recalcular rating promedio del influencer basado en reseñas públicas
const recalcInfluencerRating = async (influencerId) => {
  try {
    const reviews = await InfluencerReview.find({ influencerId, status: { $in: ['published', 'edited'] } }, 'rating');
    const count = reviews.length;
    let avg = 0;
    if (count > 0) {
      const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
      avg = total / count;
    }
    await InfluencerProfile.findByIdAndUpdate(influencerId, {
      'stats.rating': avg,
      'stats.completedCampaigns': count,
    });
  } catch (e) {
    console.error('Error recalculando rating influencer:', e);
  }
};

exports.recalcInfluencerRating = recalcInfluencerRating;

// Configurar filtro de malas palabras (incluye palabras en español básicas)
const profanityFilter = new Filter();
// Agregar algunas palabras comunes en español si no están incluidas
profanityFilter.addWords('puta', 'mierda', 'cabron', 'pendejo', 'coño', 'gilipollas');

// helpers
const HOURS_48 = 48 * 60 * 60 * 1000;

// Crea una reseña nueva
exports.createReview = async (req, res) => {
  try {
    const { campaignId, influencerId, rating, comment = '', tags = [] } = req.body;
    const companyId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(influencerId)) {
      return errorResponse(res, 'IDs inválidos', 400);
    }
    if (!rating || rating < 1 || rating > 5) {
      return errorResponse(res, 'Calificación fuera de rango', 400);
    }
    if (comment && (comment.length < 20 || comment.length > 1000)) {
      return errorResponse(res, 'El comentario debe tener entre 20 y 1000 caracteres', 400);
    }

    // Filtro de lenguaje inapropiado y datos sensibles
    if (comment && profanityFilter.isProfane(comment)) {
      return errorResponse(res, 'El comentario contiene lenguaje inapropiado', 400);
    }
    // Regex para detectar datos sensibles: correos, teléfonos y números de tarjetas de crédito
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phoneRegex = /\+?\d{2,}[- .]?\d{3,}[- .]?\d{3,}/;
    const ccRegex = /\b(?:\d[ -]*?){13,19}\b/; // 13-19 dígitos con espacios o guiones opcionales
    if (comment && (emailRegex.test(comment) || phoneRegex.test(comment) || ccRegex.test(comment))) {
      return errorResponse(res, 'El comentario no puede incluir datos de contacto personales ni números sensibles', 400);
    }

    // TODO: verificar elegibilidad con campaña/hitos y ventana de tiempo.

    const review = new InfluencerReview({
      campaignId,
      influencerId,
      companyId,
      rating,
      comment: comment.trim(),
      tags,
      editableUntil: new Date(Date.now() + HOURS_48),
    });

    await review.save();

    // Recalcular promedio del influencer de forma robusta
    await recalcInfluencerRating(influencerId);

    // Notificar al influencer de la nueva reseña
    try {
      const io = req.app.get('io');
      const campaignDoc = await Campaign.findById(campaignId).select('name');
      if (io) {
        await NotificationService.emitAndPersist(io, {
          users: [influencerId],
          type: NotificationTypes.INFLUENCER_REVIEW,
          title: 'Has recibido una nueva reseña',
          message: 'Una marca ha dejado una reseña sobre tu participación',
          entity: review._id,
          data: { campaignName: campaignDoc?.name || '', rating },
        });
      }
    } catch (notifyErr) {
      console.error('Error enviando notificación de reseña de influencer:', notifyErr);
    }

    return successResponse(res, review, 'Reseña creada', 201);
  } catch (err) {
    console.error('Error creando reseña de influencer:', err);
    return errorResponse(res, 'Error al crear la reseña', 500);
  }
};

// Edita reseña (solo empresa autora y dentro de 48h)
exports.editReview = async (req, res) => {
  try {
    const { id } = req.params; // reviewId
    const { rating, comment, tags } = req.body;
    const companyId = req.user.id;

    const review = await InfluencerReview.findById(id);
    if (!review) return errorResponse(res, 'Reseña no encontrada', 404);

    if (review.companyId.toString() !== companyId) {
      return errorResponse(res, 'No autorizado', 403);
    }
    if (new Date() > new Date(review.editableUntil)) {
      return errorResponse(res, 'La ventana de edición ha expirado', 400);
    }

    if (rating) review.rating = rating;
    if (comment !== undefined) review.comment = comment.trim();
    if (tags) review.tags = tags;
    review.status = 'edited';

    await review.save();
    // Recalcular rating promedio si se modificó el puntaje o si cambia el estado
    await recalcInfluencerRating(review.influencerId);
    return successResponse(res, review, 'Reseña editada');
  } catch (err) {
    console.error('Error editando reseña:', err);
    return errorResponse(res, 'Error al editar reseña', 500);
  }
};

// Influencer responde reseña
exports.replyReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const review = await InfluencerReview.findById(id);
    if (!review) return errorResponse(res, 'Reseña no encontrada', 404);

    if (review.influencerId.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }
    review.reply = { text: text.trim(), createdAt: new Date() };
    await review.save();
    return successResponse(res, review.reply, 'Respuesta realizada');
  } catch (err) {
    console.error('Error respondiendo reseña:', err);
    return errorResponse(res, 'Error al responder reseña', 500);
  }
};

// Reportar reseña
exports.reportReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const review = await InfluencerReview.findById(id);
    if (!review) return errorResponse(res, 'Reseña no encontrada', 404);

    // Cualquiera de las partes puede reportar
    if (review.companyId.toString() !== userId && review.influencerId.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }
    review.status = 'reported';
    await review.save();
    return successResponse(res, null, 'Reseña reportada');
  } catch (err) {
    console.error('Error reportando reseña:', err);
    return errorResponse(res, 'Error al reportar reseña', 500);
  }
};

// Admin: listar reseñas reportadas
exports.listReportedReviews = async (req, res) => {
  try {
    const reviews = await InfluencerReview.find({ status: 'reported' }).sort({ createdAt: -1 });
    return successResponse(res, reviews, 'Reseñas reportadas');
  } catch (err) {
    console.error('Error obteniendo reseñas reportadas:', err);
    return errorResponse(res, 'Error al obtener reseñas reportadas', 500);
  }
};

// Admin: actualizar estado de una reseña
exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "published" | "hidden"
    if (!['published', 'hidden'].includes(status)) {
      return errorResponse(res, 'Estado no válido', 400);
    }
    const review = await InfluencerReview.findById(id);
    if (!review) return errorResponse(res, 'Reseña no encontrada', 404);
    review.status = status;
    await review.save();
    // Recalcular rating promedio cuando cambia la visibilidad pública
    await recalcInfluencerRating(review.influencerId);
    return successResponse(res, review, 'Estado actualizado');
  } catch (err) {
    console.error('Error actualizando estado de reseña:', err);
    return errorResponse(res, 'Error al actualizar estado', 500);
  }
};

exports.getInfluencerReviews = async (req, res) => {
  try {
    const { influencerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '5', 10)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      InfluencerReview.find({ influencerId, status: { $in: ['published', 'edited'] } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      InfluencerReview.countDocuments({ influencerId, status: { $in: ['published', 'edited'] } })
    ]);

    const hasMore = skip + items.length < total;
    return successResponse(res, { items, page, limit, total, hasMore }, 'Reseñas obtenidas');
  } catch (err) {
    console.error('Error obteniendo reseñas:', err);
    return errorResponse(res, 'Error al obtener reseñas', 500);
  }
};
