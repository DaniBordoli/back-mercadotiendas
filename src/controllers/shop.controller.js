const Shop = require('../models/Shop');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');

exports.createShop = async (req, res) => {
  try {
    const shopData = req.body;
    console.log('Received shop data:', shopData);
    console.log('User from token:', req.user);
    const userId = req.user.id; 

    
    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    
    if (user.shop) {
      return errorResponse(res, 'El usuario ya es propietario de una tienda', 400);
    }

    
    const shopModelData = {
      name: shopData.shopName,
      description: shopData.description,
      category: shopData.category,
      address: shopData.address,
      brandName: shopData.brandName,
      contactEmail: shopData.contactEmail,
      shopPhone: shopData.shopPhone,
      owner: userId
    };

   
    const newShop = new Shop(shopModelData);

    
    await newShop.save();


    user.shop = newShop._id;
    await user.save();

    return successResponse(res, {
      message: 'Tienda creada exitosamente',
      shop: newShop
    });

  } catch (err) {
    console.error('Error al crear tienda:', err);
    return errorResponse(res, 'Error al crear tienda', 500);
  }
};

exports.getShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findById(id);
    
    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    return successResponse(res, shop);
  } catch (err) {
    console.error('Error al obtener tienda:', err);
    return errorResponse(res, 'Error al obtener tienda', 500);
  }
};

exports.updateShop = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    const shop = await Shop.findById(id);
    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    // Verificar que el usuario es el dueño de la tienda
    if (shop.owner.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }

    // Actualizar la tienda
    Object.assign(shop, updates);
    await shop.save();

    return successResponse(res, {
      message: 'Tienda actualizada exitosamente',
      shop
    });
  } catch (err) {
    console.error('Error al actualizar tienda:', err);
    return errorResponse(res, 'Error al actualizar tienda', 500);
  }
};

exports.deleteShop = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const shop = await Shop.findById(id);
    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    // Verificar que el usuario es el dueño de la tienda
    if (shop.owner.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }

    // Eliminar la tienda
    await shop.deleteOne();

    // Actualizar el usuario
    const user = await User.findById(userId);
    user.shop = null;
    await user.save();

    return successResponse(res, {
      message: 'Tienda eliminada exitosamente'
    });
  } catch (err) {
    console.error('Error al eliminar tienda:', err);
    return errorResponse(res, 'Error al eliminar tienda', 500);
  }
};
