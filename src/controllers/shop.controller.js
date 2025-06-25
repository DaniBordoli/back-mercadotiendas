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

const deepMerge = (target, source) => {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      
      target[key] = deepMerge(target[key], source[key]);
    } else {
      
      target[key] = source[key];
    }
  }
  return target;
};

exports.createShop = async (req, res) => {
  try {
    const shopData = req.body;
    console.log('Received shop data for creation:', shopData);
    console.log('User from token:', req.user);

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }
    if (user.shop) {
      return errorResponse(res, 'El usuario ya es propietario de una tienda', 400);
    }

    // --- Subdomain Validation --- 
    if (!shopData.subdomain || !/^[a-z0-9-]{3,30}$/.test(shopData.subdomain)) {
        return errorResponse(res, 'Subdominio inválido o faltante (3-30 caracteres, solo minúsculas, números, guiones).', 400);
    }
    // Use 'address' field to store subdomain, assuming that's the unique identifier in the model
    // If you have a dedicated 'subdomain' field in the model, use that instead.
    const existingShop = await Shop.findOne({ address: shopData.subdomain });
    if (existingShop) {
       return errorResponse(res, 'El subdominio ya está en uso', 400);
    }
    // --- End Validation ---

    // Ensure required fields are present (add more as needed)
    if (!shopData.shopName || !shopData.layoutDesign || !shopData.contactEmail || !shopData.shopPhone ) {
        return errorResponse(res, 'Faltan campos requeridos para crear la tienda.', 400);
    }

    const shopModelData = {
      name: shopData.shopName,
      description: shopData.description || '', // Provide default if optional
      category: shopData.category || 'other', // Provide default if optional
      address: shopData.subdomain, // Storing subdomain in address field
      layoutDesign: shopData.layoutDesign,
      contactEmail: shopData.contactEmail,
      shopPhone: shopData.shopPhone,
      owner: userId,
      // active: true, // Default is true in model
      // imageUrl: null, // Default is null
      // templateConfig: shopData.templateConfig, // Add if saving template details
    };

    console.log('Attempting to save shop with data:', shopModelData);
    const newShop = new Shop(shopModelData);
    await newShop.save();

    console.log('Shop saved successfully:', newShop._id);

    user.shop = newShop._id;
    await user.save();
    console.log('User document updated with shop ID.');

    // Return the created shop data along with the success message
    return successResponse(res, {
      message: 'Tienda creada exitosamente',
      shop: newShop.toObject() // Send plain object
    });

  } catch (err) {
    console.error('Error al crear tienda:', err);
    // Handle potential duplicate key errors on other fields if necessary
    if (err.code === 11000) {
         return errorResponse(res, 'Error: Hubo un conflicto al guardar la tienda (posible duplicado).', 409);
    }
    return errorResponse(res, 'Error interno al crear tienda', 500);
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

exports.updateShopTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { templateUpdate } = req.body;
    if (!templateUpdate || typeof templateUpdate !== 'object') {
      return errorResponse(res, 'templateUpdate es requerido y debe ser un objeto', 400);
    }
    const user = await User.findById(userId).populate('shop');
    if (!user || !user.shop) {
      return errorResponse(res, 'Tienda no encontrada para el usuario', 404);
    }
    const current = user.shop.templateUpdate || {};
    
    // Preservar el logoUrl actual si no se está enviando uno nuevo explícitamente
    if (current.logoUrl && !templateUpdate.logoUrl) {
      templateUpdate.logoUrl = current.logoUrl;
    }
    
    const merged = deepMerge({ ...current }, templateUpdate);
    user.shop.templateUpdate = merged;
    
    // Sincronizar ciertas propiedades del template con el modelo Shop
    const shopUpdates = {};
    if (templateUpdate.title) {
      shopUpdates.name = templateUpdate.title;
    }
    
    if (templateUpdate.shopName) {
      shopUpdates.name = templateUpdate.shopName;
    }
    
    // Aplicar actualizaciones al modelo Shop si hay cambios
    if (Object.keys(shopUpdates).length > 0) {
      console.log('Sincronizando datos del template con Shop:', shopUpdates);
      Object.assign(user.shop, shopUpdates);
    }
    
    await user.shop.save();
    return successResponse(res, user.shop, 'Template actualizado correctamente');
  } catch (error) {
    console.error('Error actualizando templateUpdate:', error);
    return errorResponse(res, 'Error actualizando templateUpdate', 500);
  }
};

exports.getMyShop = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).populate('shop');
    
    if (!user || !user.shop) {
      return errorResponse(res, 'Usuario no tiene tienda asociada', 404);
    }

    return successResponse(res, { shop: user.shop });
  } catch (err) {
    console.error('Error al obtener tienda del usuario:', err);
    return errorResponse(res, 'Error al obtener tienda', 500);
  }
};

exports.updateShopLogo = async (req, res) => {
  // Manejar la carga del archivo
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return errorResponse(res, 'Error al subir el archivo: ' + err.message, 400);
    } else if (err) {
      return errorResponse(res, 'Error al procesar el archivo: ' + err.message, 400);
    }

    try {
      const userId = req.user.id;
      
      // Verificar que se subió una imagen
      if (!req.file) {
        return errorResponse(res, 'No se encontró archivo de imagen', 400);
      }

      // Buscar la tienda del usuario
      const user = await User.findById(userId).populate('shop');
      if (!user || !user.shop) {
        return errorResponse(res, 'Tienda no encontrada', 404);
      }

      const shop = user.shop;

      try {
        // Si ya existe un logo, eliminar el anterior de Cloudinary
        if (shop.imageUrl) {
          await cloudinaryService.deleteImage(shop.imageUrl);
        }

        // Subir la nueva imagen a Cloudinary
        const uploadResult = await cloudinaryService.uploadImage(req.file.buffer, 'shop-logos');

        // Actualizar la URL del logo en la tienda
        shop.imageUrl = uploadResult;
        
        // También actualizar en templateUpdate para que se refleje en el frontend
        if (!shop.templateUpdate) {
          shop.templateUpdate = {};
        }
        shop.templateUpdate.logoUrl = uploadResult;
        
        await shop.save();

        return successResponse(res, {
          message: 'Logo actualizado exitosamente',
          logoUrl: uploadResult
        });

      } catch (uploadError) {
        console.error('Error al subir imagen a Cloudinary:', uploadError);
        return errorResponse(res, 'Error al procesar la imagen', 500);
      }

    } catch (err) {
      console.error('Error al actualizar logo:', err);
      return errorResponse(res, 'Error interno al actualizar logo', 500);
    }
  });
};

exports.getShopTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const User = require('../models/User');
    const user = await User.findById(userId).populate('shop');
    if (!user || !user.shop) {
      return res.status(404).json({ message: 'Tienda no encontrada para el usuario' });
    }
    return res.json({ templateUpdate: user.shop.templateUpdate || {} });
  } catch (error) {
    return res.status(500).json({ message: 'Error obteniendo estilos de tienda', error: error.message });
  }
};
