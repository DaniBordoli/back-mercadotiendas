const { Campaign, CampaignApplication, User } = require('../models');
const InfluencerReview = require('../models/InfluencerReview');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/response');
const reviewCtrl = require('./influencerReview.controller');

// Ventana de calificación: 15 días posteriores a la fecha de fin
const WINDOW_DAYS = 15;

exports.isRateable = async (req, res) => {
  try {
    const { campaignId, influencerId } = req.params;
    const companyId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(influencerId)) {
      return errorResponse(res, 'IDs inválidos', 400);
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return errorResponse(res, 'Campaña no encontrada', 404);

    // Verificar que la campaña pertenece a la tienda del usuario (empresa que consulta)
    const user = await User.findById(companyId).populate('shop');
    if (!user.shop || !campaign.shop.equals(user.shop._id)) {
      return errorResponse(res, 'No autorizado', 403);
    }

    // Existe aplicación aceptada?
    const application = await CampaignApplication.findOne({ campaign: campaignId, user: influencerId, status: 'accepted' });
    if (!application) return successResponse(res, { isRateable: false });

    // Al menos un hito aprobado
    const approved = (application.milestones || []).some(m => m.status === 'approved');
    if (!approved) return successResponse(res, { isRateable: false });

    // Ventana temporal
    const now = new Date();
    if (campaign.endDate) {
      const limit = new Date(campaign.endDate.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
      if (now > limit) return successResponse(res, { isRateable: false });
    }

    // No reseña previa
    const existing = await InfluencerReview.findOne({ campaignId, influencerId });
    if (existing) return successResponse(res, { isRateable: false });

    return successResponse(res, { isRateable: true });
  } catch (err) {
    console.error('Error isRateable:', err);
    return errorResponse(res, 'Error interno', 500);
  }
};

exports.createRating = async (req, res) => {
  try {
    const { campaignId, influencerId } = req.params;

    // Pasar IDs al cuerpo para que createReview los use
    req.body = {
      ...req.body,
      campaignId,
      influencerId,
    };

    // Delegar creación a createReview
    return await reviewCtrl.createReview(req, res);
  } catch (err) {
    console.error('Error createRating:', err);
    return errorResponse(res, 'Error interno', 500);
  }
};