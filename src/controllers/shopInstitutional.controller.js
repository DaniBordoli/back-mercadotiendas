const ShopInstitutional = require('../models/ShopInstitutional');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');

// Obtener información institucional de la tienda del usuario
exports.getShopInstitutional = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).populate('shop');
    
    if (!user || !user.shop) {
      return errorResponse(res, 'Usuario no tiene tienda asociada', 404);
    }

    const institutional = await ShopInstitutional.findOne({ shop: user.shop._id });
    
    if (!institutional) {
      // Si no existe, crear uno vacío
      const newInstitutional = new ShopInstitutional({ shop: user.shop._id });
      await newInstitutional.save();
      return successResponse(res, { institutional: newInstitutional });
    }

    return successResponse(res, { institutional });
  } catch (err) {
    console.error('Error al obtener información institucional:', err);
    return errorResponse(res, 'Error al obtener información institucional', 500);
  }
};

// Actualizar información institucional de la tienda
exports.updateShopInstitutional = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      description,
      mission,
      vision,
      history,
      values,
      shippingPolicy,
      returnPolicy,
      termsAndConditions,
      taxId,
      businessName,
      fiscalAddress,
      teamMembers
    } = req.body;
    
    const user = await User.findById(userId).populate('shop');
    
    if (!user || !user.shop) {
      return errorResponse(res, 'Usuario no tiene tienda asociada', 404);
    }

    // Verificar que el usuario es el dueño de la tienda
    if (user.shop.owner.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }

    let institutional = await ShopInstitutional.findOne({ shop: user.shop._id });
    
    if (!institutional) {
      // Crear nuevo registro si no existe
      institutional = new ShopInstitutional({ shop: user.shop._id });
    }

    // Actualizar campos
    if (description !== undefined) institutional.description = description;
    if (mission !== undefined) institutional.mission = mission;
    if (vision !== undefined) institutional.vision = vision;
    if (history !== undefined) institutional.history = history;
    if (values !== undefined) institutional.values = values;
    if (shippingPolicy !== undefined) institutional.shippingPolicy = shippingPolicy;
    if (returnPolicy !== undefined) institutional.returnPolicy = returnPolicy;
    if (termsAndConditions !== undefined) institutional.termsAndConditions = termsAndConditions;
    if (taxId !== undefined) institutional.taxId = taxId;
    if (businessName !== undefined) institutional.businessName = businessName;
    if (fiscalAddress !== undefined) institutional.fiscalAddress = fiscalAddress;
    if (Array.isArray(teamMembers)) institutional.teamMembers = teamMembers;

    await institutional.save();

    return successResponse(res, { 
      institutional,
      message: 'Información institucional actualizada exitosamente' 
    });
  } catch (err) {
    console.error('Error al actualizar información institucional:', err);
    return errorResponse(res, 'Error al actualizar información institucional', 500);
  }
};

// Obtener información institucional por ID de tienda (público)
exports.getShopInstitutionalByShopId = async (req, res) => {
  try {
    const { shopId } = req.params;
    
    const institutional = await ShopInstitutional.findOne({ shop: shopId });
    
    if (!institutional) {
      return successResponse(res, { institutional: null });
    }

    return successResponse(res, { institutional });
  } catch (err) {
    console.error('Error al obtener información institucional:', err);
    return errorResponse(res, 'Error al obtener información institucional', 500);
  }
};
