const { CampaignApplication, Campaign, User, Shop } = require('../models');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

/**
 * Crear una nueva aplicación a una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.applyToCampaign = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { campaignId } = req.params;
    const { message, socialMediaLinks = [], milestones = [], proposedFee, totalAmount } = req.body;

    // Validación de hitos
    if (!Array.isArray(milestones) || milestones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes incluir al menos un hito en tu propuesta'
      });
    }

    for (const [index, m] of milestones.entries()) {
      if (!m.title || !m.date || m.amount === undefined) {
        return res.status(400).json({
          success: false,
          message: `El hito #${index + 1} debe incluir título, fecha y monto`
        });
      }
      const amountNum = Number(m.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          success: false,
          message: `El monto del hito #${index + 1} debe ser mayor a 0`
        });
      }
    }

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    // Verificar que la campaña existe y está activa
    const campaign = await Campaign.findById(campaignId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaña no encontrada'
      });
    }
    
    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'No se puede aplicar a una campaña que no está activa'
      });
    }

    // Validar fechas de hitos dentro del rango de la campaña
    const campaignStart = new Date(campaign.startDate);
    const campaignEnd = new Date(campaign.endDate);
    for (const [index, m] of milestones.entries()) {
      const milestoneDate = new Date(m.date);
      if (milestoneDate < campaignStart || milestoneDate > campaignEnd) {
        return res.status(400).json({
          success: false,
          message: `La fecha del hito #${index + 1} debe estar dentro del rango de la campaña`
        });
      }
    }

    if (new Date() > new Date(campaign.endDate)) {
      return res.status(400).json({
        success: false,
        message: 'No se puede aplicar a una campaña que ya ha expirado'
      });
    }
    
    // Verificar si el usuario tiene una aplicación vigente (pending o accepted) para esta campaña
    const existingActiveApplication = await CampaignApplication.findOne({
      campaign: campaignId,
      user: req.user.id,
      status: { $in: ['pending', 'accepted'] }
    });

    if (existingActiveApplication) {
      return res.status(400).json({
        success: false,
        message: 'Ya tienes una postulación en curso o aceptada para esta campaña'
      });
    }
    
    // Crear la aplicación con todos los datos
    const application = new CampaignApplication({
      campaign: campaignId,
      user: req.user.id,
      message,
      socialMediaLinks,
      milestones,
      proposedFee,
      totalAmount
    });
    
    await application.save();

    await campaign.incrementApplicationsCount();
    try {
      const shop = await Shop.findById(campaign.shop).select('owner');
      const io = req.app.get('io');
      if (shop && io) {
        await NotificationService.emitAndPersist(io, {
          users: [shop.owner],
          type: NotificationTypes.CAMPAIGN,
          title: 'Nueva postulación',
          message: `Has recibido una nueva postulación en tu campaña ${campaign.name || ''}`,
          entity: campaign._id,
          data: {
            campaignName: campaign.name || '',
            milestonesCount: Array.isArray(milestones) ? milestones.length : 0,
            proposedFee: proposedFee || 0
          }
        });
      }
    } catch (e) {}
    
    res.status(201).json({
      success: true,
      data: application,
      message: 'Aplicación enviada exitosamente'
    });
  } catch (error) {
    console.error('Error al aplicar a la campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al aplicar a la campaña',
      error: error.message
    });
  }
};

/**
 * Obtener todas las aplicaciones de una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getCampaignApplications = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    // Verificar que la campaña existe
    const campaign = await Campaign.findById(campaignId);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaña no encontrada'
      });
    }
    
    // Verificar que el usuario es el dueño de la tienda que creó la campaña
    const user = await User.findById(req.user.id).populate('shop');
    
    if (!user.shop || !campaign.shop.equals(user.shop._id)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver las aplicaciones de esta campaña'
      });
    }
    
    const applications = await CampaignApplication.find({ campaign: campaignId })
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: applications
    });
  } catch (error) {
    console.error('Error al obtener aplicaciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las aplicaciones',
      error: error.message
    });
  }
};

/**
 * Obtener una aplicación específica por ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de aplicación inválido'
      });
    }
    
    const application = await CampaignApplication.findById(id)
      .populate('user', 'name email avatar')
      .populate('campaign');

    // Obtener perfil de influencer y adjuntarlo al usuario
    const InfluencerProfile = require('../models/InfluencerProfile');
    const influencerProfile = await InfluencerProfile.findOne({ user: application.user._id });
    if (influencerProfile) {
      application.user = application.user.toObject();
      application.user.influencerProfile = influencerProfile;
    }
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplicación no encontrada'
      });
    }
    
    // Verificar que el usuario es el dueño de la aplicación o el dueño de la campaña
    const user = await User.findById(req.user.id).populate('shop');
    const campaign = await Campaign.findById(application.campaign);
    
    const isApplicant = application.user.equals(req.user.id);
    const isShopOwner = user.shop && campaign && campaign.shop && campaign.shop.equals(user.shop._id);

    if (!isApplicant && !isShopOwner) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para ver esta aplicación'
      });
    }
    
    res.status(200).json({
      success: true,
      data: application
    });
  } catch (error) {
    console.error('Error al obtener aplicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la aplicación',
      error: error.message
    });
  }
};

/**
 * Guardar o actualizar un borrador de aplicación a una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.saveDraftApplication = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { campaignId } = req.params;
    const { message, socialMediaLinks = [], milestones = [], proposedFee, totalAmount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, message: 'ID de campaña inválido' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    }

    // Buscar borrador existente del usuario para esta campaña
    let draft = await CampaignApplication.findOne({ campaign: campaignId, user: req.user.id, status: 'draft' });

    if (draft) {
      // Actualizar borrador existente
      draft.message = message;
      draft.socialMediaLinks = socialMediaLinks;
      draft.milestones = milestones;
      draft.proposedFee = proposedFee;
      draft.totalAmount = totalAmount;
      await draft.save();
    } else {
      draft = new CampaignApplication({
        campaign: campaignId,
        user: req.user.id,
        message,
        socialMediaLinks,
        milestones,
        proposedFee,
        totalAmount,
        status: 'draft'
      });
      await draft.save();
    }

    return res.status(200).json({ success: true, data: draft, message: 'Borrador guardado' });
  } catch (error) {
    console.error('Error al guardar borrador de aplicación:', error);
    return res.status(500).json({ success: false, message: 'Error al guardar borrador', error: error.message });
  }
};

/**
 * Actualizar el estado de una aplicación (aceptar/rechazar)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de aplicación inválido'
      });
    }

    const application = await CampaignApplication.findById(id);
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplicación no encontrada'
      });
    }

    const campaign = await Campaign.findById(application.campaign);

    if (!['accepted', 'rejected', 'pending', 'viewed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }

    if (application.status === status) {
      return res.status(200).json({
        success: true,
        data: application,
        message: `La aplicación ya se encuentra en estado ${status}`
      });
    }

    if (['accepted', 'rejected'].includes(status) && !['pending', 'viewed'].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: 'La aplicación ya fue decidida anteriormente'
      });
    }

    const updatePayload = {
      status,
      decidedAt: new Date(),
      decidedBy: req.user.id
    };

    if (status === 'rejected') {
      updatePayload.rejectReason = reason || null;
    }

    if (status === 'accepted') {
      updatePayload.isLocked = true;
    }

    const updatedApplication = await CampaignApplication.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: false
    });
    try {
      const io = req.app.get('io');
      if (io && updatedApplication) {
        await NotificationService.emitAndPersist(io, {
          users: [updatedApplication.user],
          type: NotificationTypes.CAMPAIGN,
          title: `Aplicación ${status}`,
          message: `Tu aplicación para la campaña ${campaign?.name || ''} ha sido ${status}`,
          entity: updatedApplication.campaign,
          data: { campaignName: campaign?.name || '', status }
        });
      }
    } catch (e) {}

    if (status === 'accepted' && campaign && campaign.exclusive === true) {
      let toRejectUsers = [];
      try {
        const others = await CampaignApplication.find({
          _id: { $ne: id },
          campaign: campaign._id,
          status: { $in: ['pending', 'viewed'] }
        }).select('user');
        toRejectUsers = others.map((a) => a.user);
      } catch (e) {}
      await CampaignApplication.updateMany(
        {
          _id: { $ne: id },
          campaign: campaign._id,
          status: { $in: ['pending', 'viewed'] }
        },
        {
          $set: {
            status: 'rejected',
            decidedAt: new Date(),
            decidedBy: req.user.id,
            rejectReason: 'La campaña fue cerrada a otra propuesta',
            isLocked: true
          }
        }
      ).catch(console.error);
      try {
        const io = req.app.get('io');
        if (io && toRejectUsers.length) {
          await NotificationService.emitAndPersist(io, {
            users: toRejectUsers,
            type: NotificationTypes.CAMPAIGN,
            title: 'Aplicación rechazada',
            message: 'Tu aplicación para la campaña ha sido rechazada',
            entity: campaign._id,
            data: { status: 'rejected' }
          });
        }
      } catch (e) {}
    }

    res.status(200).json({
      success: true,
      data: updatedApplication,
      message: `Estado de la aplicación actualizado a ${status}`
    });
  } catch (error) {
    console.error('Error al actualizar estado de aplicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el estado de la aplicación',
      error: error.message
    });
  }
};

/**
 * Obtener todas las aplicaciones del usuario actual
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getUserApplications = async (req, res) => {
  try {
    const applications = await CampaignApplication.find({ user: req.user.id })
      .populate({
        path: 'campaign',
        populate: [
          {
            path: 'shop',
            select: 'name imageUrl subdomain'
          },
          {
            path: 'products',
            select: 'nombre productImages precio'
          }
        ]
      })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: applications
    });
  } catch (error) {
    console.error('Error al obtener aplicaciones del usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las aplicaciones del usuario',
      error: error.message
    });
  }
};

exports.deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de aplicación inválido'
      });
    }

    const application = await CampaignApplication.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplicación no encontrada'
      });
    }

    // Verificar permisos: solicitante o dueño de la campaña
    const user = await User.findById(req.user.id).populate('shop');
    const campaign = await Campaign.findById(application.campaign);

    const isApplicant = application.user.equals(req.user.id);
    const isShopOwner = user.shop && campaign && campaign.shop && campaign.shop.equals(user.shop._id);

    if (!isApplicant && !isShopOwner) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar esta aplicación'
      });
    }

    await CampaignApplication.findByIdAndDelete(id);

    // Actualizar contador de aplicaciones en la campaña
    await Campaign.findByIdAndUpdate(application.campaign, { $inc: { applicationsCount: -1 } }).catch(console.error);

    // Actualizar stats del perfil de influencer, si existe
    try {
      const InfluencerProfile = require('../models/InfluencerProfile');
      const influencerProfile = await InfluencerProfile.findOne({ user: application.user });
      if (influencerProfile) {
        influencerProfile.stats.totalApplications = Math.max(0, (influencerProfile.stats.totalApplications || 1) - 1);
        await influencerProfile.save();
      }
    } catch (err) {
      console.error('Error actualizando stats de influencer al eliminar aplicación', err);
    }

    res.status(200).json({
      success: true,
      message: 'Aplicación eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar aplicación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la aplicación',
      error: error.message
    });
  }
};

/**
 * Enviar un hito por parte del influencer
 * Requiere que la aplicación esté en estado 'accepted'
 * Actualiza el hito a 'submitted' y marca submittedAt
 */
exports.submitMilestone = async (req, res) => {
  try {
    const { appId, milestoneId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(appId) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
      return res.status(400).json({ success: false, message: 'IDs inválidos' });
    }

    const application = await CampaignApplication.findById(appId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Aplicación no encontrada' });
    }

    const isApplicant = application.user.equals(req.user.id);
    if (!isApplicant) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para enviar este hito' });
    }

    if (application.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'La aplicación debe estar aceptada para enviar hitos' });
    }

    const milestone = application.milestones.id(milestoneId);
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Hito no encontrado' });
    }

    if (['approved'].includes(milestone.status)) {
      return res.status(400).json({ success: false, message: 'Este hito ya fue aprobado' });
    }

    // Idempotencia básica: si ya está submitted, devolver sin error
    if (milestone.status === 'submitted') {
      return res.status(200).json({ success: true, data: application, message: 'El hito ya fue entregado' });
    }

    milestone.status = 'submitted';
    milestone.submittedAt = new Date();
    milestone.reviewNotes = null;

    await application.save();
    try {
      const campaign = await Campaign.findById(application.campaign).select('shop name');
      const shop = campaign ? await Shop.findById(campaign.shop).select('owner') : null;
      const io = req.app.get('io');
      if (io && shop) {
        await NotificationService.emitAndPersist(io, {
          users: [shop.owner],
          type: NotificationTypes.MILESTONE,
          title: 'Hito enviado',
          message: `Se entregó el hito "${milestone.title || ''}" para revisión en ${campaign?.name || ''}`,
          entity: application.campaign,
          data: { campaignName: campaign?.name || '', milestoneTitle: milestone.title || '' }
        });
      }
    } catch (e) {}

    return res.status(200).json({ success: true, data: application, message: 'Hito entregado correctamente' });
  } catch (error) {
    console.error('Error al enviar hito:', error);
    return res.status(500).json({ success: false, message: 'Error al enviar el hito', error: error.message });
  }
};

/**
 * Revisar un hito por parte del dueño de la tienda
 * Permite aprobar o rechazar un hito. Si todos quedan aprobados, la aplicación pasa a 'completed'.
 */
exports.reviewMilestone = async (req, res) => {
  try {
    const { appId, milestoneId } = req.params;
    const { status, reviewNotes, rating, comment, tags } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(appId) || !mongoose.Types.ObjectId.isValid(milestoneId)) {
      return res.status(400).json({ success: false, message: 'IDs inválidos' });
    }

    const application = await CampaignApplication.findById(appId).populate('campaign');
    if (!application) {
      return res.status(404).json({ success: false, message: 'Aplicación no encontrada' });
    }

    const user = await User.findById(req.user.id).populate('shop');
    const campaign = await Campaign.findById(application.campaign._id);
    const isShopOwner = user.shop && campaign && campaign.shop && campaign.shop.equals(user.shop._id);
    if (!isShopOwner) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para revisar hitos de esta campaña' });
    }

    if (application.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Solo se pueden revisar hitos de aplicaciones aceptadas' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Estado de revisión inválido' });
    }

    const milestone = application.milestones.id(milestoneId);
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Hito no encontrado' });
    }

    milestone.status = status;
    milestone.reviewNotes = status === 'rejected' ? (reviewNotes || '') : null;

    await application.save();
    try {
      const io = req.app.get('io');
      if (io) {
        await NotificationService.emitAndPersist(io, {
          users: [application.user],
          type: NotificationTypes.MILESTONE,
          title: status === 'approved' ? 'Hito aprobado' : 'Hito rechazado',
          message: status === 'approved' ? `Tu hito "${milestone.title || ''}" fue aprobado en ${application.campaign?.name || ''}` : `Tu hito "${milestone.title || ''}" fue rechazado en ${application.campaign?.name || ''}`,
          entity: application.campaign,
          data: { campaignName: application.campaign?.name || '', milestoneTitle: milestone.title || '', reviewNotes: milestone.reviewNotes || '' }
        });
      }
    } catch (e) {}

    try {
      const normalizedRating = Number(rating);
      const hasRating = !isNaN(normalizedRating) && normalizedRating >= 1 && normalizedRating <= 5;
      if (hasRating) {
        const InfluencerReview = require('../models/InfluencerReview');
        const { recalcInfluencerRating } = require('./influencerReview.controller');

        const exists = await InfluencerReview.findOne({
          campaignId: application.campaign._id,
          influencerId: application.user,
          companyId: req.user.id
        });

        if (!exists) {
          const HOURS_48 = 48 * 60 * 60 * 1000;
          const tagMap = {
            quality: 'content_quality',
            milestones: 'milestone_compliance',
            punctuality: 'punctuality',
            communication: 'communication',
            impact: 'impact_sales'
          };
          const safeTags = Array.isArray(tags)
            ? tags.map(t => tagMap[t] || undefined).filter(Boolean)
            : [];

          const reviewDoc = new InfluencerReview({
            campaignId: application.campaign._id,
            influencerId: application.user,
            companyId: req.user.id,
            rating: normalizedRating,
            comment: typeof comment === 'string' ? comment.trim() : undefined,
            tags: safeTags,
            editableUntil: new Date(Date.now() + HOURS_48)
          });
          await reviewDoc.save();

          try {
            await recalcInfluencerRating(application.user);
          } catch (recalcErr) {
            console.error('Error recalculando rating influencer tras reseña en revisión de hito:', recalcErr);
          }

          try {
            const io = req.app.get('io');
            if (io) {
              await NotificationService.emitAndPersist(io, {
                users: [application.user],
                type: NotificationTypes.INFLUENCER_REVIEW,
                title: 'Has recibido una nueva reseña',
                message: 'La marca dejó una reseña al revisar tu hito',
                entity: reviewDoc._id,
                data: { campaignName: application.campaign?.name || '', rating: normalizedRating }
              });
            }
          } catch (notifyErr) {
            console.error('Error notificando reseña creada durante revisión de hito:', notifyErr);
          }
        }
      }
    } catch (ratingErr) {
      console.error('Error creando reseña durante revisión de hito:', ratingErr);
    }

    if (status === 'approved') {
      const allApproved = application.milestones.every((m) => m.status === 'approved');
      if (allApproved) {
        application.status = 'completed';
        application.decidedAt = new Date();
        application.decidedBy = req.user.id;
        await application.save();
        try {
          const io = req.app.get('io');
          if (io) {
            await NotificationService.emitAndPersist(io, {
              users: [application.user],
              type: NotificationTypes.CAMPAIGN,
              title: 'Campaña completada',
              message: 'Todos tus hitos fueron aprobados. La campaña ha finalizado.',
              entity: application.campaign,
              data: { campaignName: application.campaign?.name || '' }
            });
          }
        } catch (e) {}

        try {
          const InfluencerProfile = require('../models/InfluencerProfile');
          const profile = await InfluencerProfile.findOne({ user: application.user });
          if (profile) {
            await profile.campaignCompleted();
          }
        } catch (statsErr) {
          console.error('Error actualizando estadísticas de influencer al completar campaña', statsErr);
        }
      }
    }

    return res.status(200).json({ success: true, data: application, message: `Hito ${status === 'approved' ? 'aprobado' : 'rechazado'} correctamente` });
  } catch (error) {
    console.error('Error al revisar hito:', error);
    return res.status(500).json({ success: false, message: 'Error al revisar el hito', error: error.message });
  }
};
