const { Campaign, Shop, User } = require('../models');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

/**
 * Obtener todas las campañas
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAllCampaigns = async (req, res) => {
  try {
    const { status, category, limit: limitQuery, offset: offsetQuery } = req.query;

    // Construir el filtro basado en los parámetros de consulta
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    // Solo mostrar campañas activas por defecto
    if (!status) filter.status = 'active';

    // Paginación (limit y offset)
    const DEFAULT_LIMIT = 20;
    const limit = Math.max(parseInt(limitQuery, 10) || DEFAULT_LIMIT, 1);
    const offset = Math.max(parseInt(offsetQuery, 10) || 0, 0);

    // Contar total de campañas que cumplen el filtro (sin paginación)
    const totalCount = await Campaign.countDocuments(filter);

    // Obtener campañas con paginación
    let campaigns = await Campaign.find(filter)
      .populate('shop', 'name imageUrl subdomain')
      .populate('products', 'categoria')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    /*
      Asegurarnos de que el contador de postulaciones refleje el número real de documentos
      en la colección CampaignApplication. Esto soluciona problemas cuando se eliminan
      postulaciones directamente de la base de datos y el campo applicationsCount
      queda desactualizado.
    */
    const { CampaignApplication } = require('../models');
    campaigns = await Promise.all(
      campaigns.map(async (c) => {
        try {
          const realCount = await CampaignApplication.countDocuments({ campaign: c._id });
          // Solo actualizamos si el valor almacenado difiere del real
          if (c.applicationsCount !== realCount) {
            c.applicationsCount = realCount;
            // Guardamos en segundo plano (no esperamos) para no impactar el tiempo de respuesta
            c.save().catch((err) => console.error('Error al sincronizar applicationsCount', err));
          }
          // Devolvemos una copia plain para poder manipular libremente sin efectos colaterales
          return c.toObject({ getters: true, virtuals: false });
        } catch (e) {
          console.error('Error contando aplicaciones para campaña', c._id, e);
          return c;
        }
      })
    );

    res.status(200).json({
      success: true,
      data: campaigns,
      totalCount,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error al obtener campañas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las campañas',
      error: error.message
    });
  }
};

/**
 * Obtener una campaña por ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    let campaign = await Campaign.findById(id)
      .populate('shop', 'name imageUrl subdomain contactEmail')
      .populate('products', 'nombre productImages precio categoria sku');
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaña no encontrada'
      });
    }
    
    // Sincronizar contador de postulaciones con la realidad
    try {
      const { CampaignApplication } = require('../models');
      const realCount = await CampaignApplication.countDocuments({ campaign: campaign._id });
      if (campaign.applicationsCount !== realCount) {
        campaign.applicationsCount = realCount;
        await campaign.save();
      }
      // Convertimos a objeto plano para no exponer métodos ni generar problemas de mutabilidad
      campaign = campaign.toObject({ getters: true, virtuals: false });
    } catch (err) {
      console.error('Error sincronizando applicationsCount en getCampaignById:', err);
    }

    res.status(200).json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error al obtener campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la campaña',
      error: error.message
    });
  }
};

/**
 * Crear una nueva campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.createCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { name, description, objectives, startDate, budget, imageUrl, endDate, status, category, requirements, products = [], milestones = [], kpis = {}, exclusive } = req.body;
    
    // Verificar que el usuario tiene una tienda
    const user = await User.findById(req.user.id).populate('shop');
    
    if (!user.shop) {
      return res.status(403).json({
        success: false,
        message: 'Debes tener una tienda para crear campañas'
      });
    }
    
    // Crear la campaña
    const campaign = new Campaign({
      name,
      description,
      shop: user.shop._id,
      budget,
      imageUrl,
      startDate,
      endDate,
      status: status || 'draft',
      category,
      requirements,
      objectives,
      products,
      milestones,
      kpis,
      exclusive: exclusive === true
    });
    
    await campaign.save();
    
    res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campaña creada exitosamente'
    });
  } catch (error) {
    console.error('Error al crear campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la campaña',
      error: error.message
    });
  }
};

/**
 * Actualizar una campaña existente
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, objectives, startDate, budget, imageUrl, endDate, status, category, requirements, products, milestones, kpis, exclusive } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    // Verificar que la campaña existe
    const campaign = await Campaign.findById(id);
    
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
        message: 'No tienes permiso para actualizar esta campaña'
      });
    }
    
    // Actualizar los campos
    campaign.name = name || campaign.name;
    campaign.description = description || campaign.description;
    campaign.objectives = objectives || campaign.objectives;
    campaign.startDate = startDate || campaign.startDate;
    campaign.budget = budget || campaign.budget;
    campaign.imageUrl = imageUrl || campaign.imageUrl;
    campaign.endDate = endDate || campaign.endDate;
    campaign.status = status || campaign.status;
    campaign.category = category || campaign.category;
    campaign.requirements = requirements || campaign.requirements;
    if (products !== undefined) campaign.products = products;
    if (milestones !== undefined) campaign.milestones = milestones;
    if (kpis !== undefined) campaign.kpis = kpis;
    if (exclusive !== undefined) campaign.exclusive = exclusive;
    
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign,
      message: 'Campaña actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la campaña',
      error: error.message
    });
  }
};

/**
 * Eliminar una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    // Verificar que la campaña existe
    const campaign = await Campaign.findById(id);
    
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
        message: 'No tienes permiso para eliminar esta campaña'
      });
    }
    
    await Campaign.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Campaña eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la campaña',
      error: error.message
    });
  }
};

/**
 * Obtener campañas por tienda
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getCampaignsByShop = async (req, res) => {
  try {
    const { shopId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de tienda inválido'
      });
    }

    // Verificar que la tienda pertenece al usuario autenticado
    try {
      const user = await User.findById(req.user.id).populate('shop');
      if (!user || !user.shop || !user.shop._id.equals(shopId)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para ver las campañas de esta tienda'
        });
      }
    } catch (err) {
      console.error('Error verificando la tienda del usuario:', err);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos del usuario',
        error: err.message
      });
    }

    const campaigns = await Campaign.find({ shop: shopId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error('Error al obtener campañas de la tienda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las campañas de la tienda',
      error: error.message
    });
  }
};

/**
 * Cambiar el estado de una campaña
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de campaña inválido'
      });
    }
    
    if (!['active', 'closed', 'draft'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado de campaña inválido'
      });
    }
    
    // Verificar que la campaña existe
    const campaign = await Campaign.findById(id);
    
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
        message: 'No tienes permiso para actualizar esta campaña'
      });
    }
    
    campaign.status = status;
    await campaign.save();
    
    res.status(200).json({
      success: true,
      data: campaign,
      message: `Estado de la campaña actualizado a ${status}`
    });
  } catch (error) {
    console.error('Error al actualizar estado de campaña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el estado de la campaña',
      error: error.message
    });
  }
};

exports.inviteInfluencer = async (req, res) => {
  try {
    const { id } = req.params;
    const { influencerId, message } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de campaña inválido' });
    }
    if (!mongoose.Types.ObjectId.isValid(influencerId)) {
      return res.status(400).json({ success: false, message: 'ID de influencer inválido' });
    }
    const campaign = await Campaign.findById(id).populate('shop', 'name owner');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaña no encontrada' });
    if (campaign.status !== 'active') return res.status(400).json({ success: false, message: 'Solo se puede invitar a campañas activas' });

    const user = await User.findById(req.user.id).populate('shop');
    if (!user.shop || !campaign.shop || !campaign.shop._id.equals(user.shop._id)) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para invitar a esta campaña' });
    }

    try {
      const io = req.app.get('io');
      await NotificationService.emitAndPersist(io, {
        users: [influencerId],
        type: NotificationTypes.OFFER,
        title: 'Invitación a campaña',
        message: message || `Te invitaron a participar en la campaña ${campaign.name}`,
        entity: campaign._id,
        data: {
          campaignId: String(campaign._id),
          campaignName: campaign.name,
          shopName: campaign.shop?.name || '',
          influencerId: String(influencerId)
        }
      });
    } catch (e) {}

    return res.status(200).json({ success: true, message: 'Invitación enviada' });
  } catch (error) {
    console.error('Error invitando a campaña:', error);
    return res.status(500).json({ success: false, message: 'Error invitando a campaña', error: error.message });
  }
};
