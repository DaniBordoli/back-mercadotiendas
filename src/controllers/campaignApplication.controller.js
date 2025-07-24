const { CampaignApplication, Campaign, User } = require('../models');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

/**
 * Crear una nueva aplicación a una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.applyToCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { campaignId } = req.params;
    const { message, socialMediaLinks, proposedFee } = req.body;
    
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
    
    if (new Date() > new Date(campaign.endDate)) {
      return res.status(400).json({
        success: false,
        message: 'No se puede aplicar a una campaña que ya ha expirado'
      });
    }
    
    // Verificar si el usuario ya ha aplicado a esta campaña
    const existingApplication = await CampaignApplication.findOne({
      campaign: campaignId,
      user: req.user.id
    });
    
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'Ya has aplicado a esta campaña'
      });
    }
    
    // Crear la aplicación
    const application = new CampaignApplication({
      campaign: campaignId,
      user: req.user.id,
      message,
      socialMediaLinks,
      proposedFee
    });
    
    await application.save();
    
    // Incrementar el contador de aplicaciones en la campaña
    await campaign.incrementApplicationsCount();
    
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
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplicación no encontrada'
      });
    }
    
    // Verificar que el usuario es el dueño de la aplicación o el dueño de la campaña
    const user = await User.findById(req.user.id).populate('shop');
    const campaign = await Campaign.findById(application.campaign);
    
    const isApplicant = application.user._id.equals(req.user.id);
    const isShopOwner = user.shop && campaign.shop.equals(user.shop._id);
    
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
 * Actualizar el estado de una aplicación (aceptar/rechazar)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de aplicación inválido'
      });
    }
    
    if (!['accepted', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado de aplicación inválido'
      });
    }
    
    const application = await CampaignApplication.findById(id);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Aplicación no encontrada'
      });
    }
    
    // Verificar que el usuario es el dueño de la tienda que creó la campaña
    const user = await User.findById(req.user.id).populate('shop');
    const campaign = await Campaign.findById(application.campaign);
    
    if (!user.shop || !campaign.shop.equals(user.shop._id)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para actualizar esta aplicación'
      });
    }
    
    application.status = status;
    await application.save();
    
    res.status(200).json({
      success: true,
      data: application,
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
        populate: {
          path: 'shop',
          select: 'name imageUrl subdomain'
        }
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
