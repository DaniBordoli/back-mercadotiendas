const { Campaign, Shop, User } = require('../models');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

/**
 * Obtener todas las campañas
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAllCampaigns = async (req, res) => {
  try {
    const { status, category } = req.query;
    
    // Construir el filtro basado en los parámetros de consulta
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    
    // Solo mostrar campañas activas por defecto
    if (!status) filter.status = 'active';
    
    const campaigns = await Campaign.find(filter)
      .populate('shop', 'name imageUrl subdomain')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: campaigns
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
    
    const campaign = await Campaign.findById(id)
      .populate('shop', 'name imageUrl subdomain contactEmail');
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaña no encontrada'
      });
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
    
    const { name, description, budget, imageUrl, endDate, status, category, requirements } = req.body;
    
    // Verificar que el usuario tiene una tienda
    const user = await User.findById(req.user.id).populate('shop');
    
    if (!user.shop) {
      return res.status(403).json({
        success: false,
        message: 'Debes tener una tienda para crear campañas'
      });
    }
    
    const campaign = new Campaign({
      name,
      description,
      shop: user.shop._id,
      budget,
      imageUrl,
      endDate,
      status: status || 'draft',
      category,
      requirements
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
    const { name, description, budget, imageUrl, endDate, status, category, requirements } = req.body;
    
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
    campaign.budget = budget || campaign.budget;
    campaign.imageUrl = imageUrl || campaign.imageUrl;
    campaign.endDate = endDate || campaign.endDate;
    campaign.status = status || campaign.status;
    campaign.category = category || campaign.category;
    campaign.requirements = requirements || campaign.requirements;
    
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
    
    const campaigns = await Campaign.find({ shop: shopId })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
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
