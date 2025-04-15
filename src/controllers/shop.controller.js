const Shop = require('../models/Shop');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const cloudinaryService = require('../services/cloudinary.service');
const multer = require('multer');

// Configurar multer para manejar la carga de archivos en memoria
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB límite
    },
    fileFilter: (req, file, cb) => {
        // Verificar que sea una imagen
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }
        cb(null, true);
    }
}).single('image'); // 'image' es el nombre del campo en el formulario

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
    // Manejar la carga del archivo
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return errorResponse(res, 'Error al subir el archivo: ' + err.message, 400);
        } else if (err) {
            return errorResponse(res, 'Error al procesar el archivo: ' + err.message, 400);
        }

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

            // Si hay una imagen nueva, subirla a Cloudinary
            if (req.file) {
                try {
                    // Si ya existe una imagen, eliminarla
                    if (shop.imageUrl) {
                        await cloudinaryService.deleteImage(shop.imageUrl);
                    }
                    
                    // Subir la nueva imagen
                    const imageUrl = await cloudinaryService.uploadImage(req.file.buffer);
                    updates.imageUrl = imageUrl;
                } catch (uploadError) {
                    console.error('Error al procesar la imagen:', uploadError);
                    return errorResponse(res, 'Error al procesar la imagen', 500);
                }
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
    });

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

    // Si la tienda tiene una imagen, eliminarla de Cloudinary
    if (shop.imageUrl) {
        try {
            await cloudinaryService.deleteImage(shop.imageUrl);
        } catch (error) {
            console.error('Error al eliminar imagen:', error);
            // Continuamos con la eliminación de la tienda aunque falle la eliminación de la imagen
        }
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
