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
  // Manejar la carga del archivo (logo)
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return errorResponse(res, 'Error al subir el logo: ' + err.message, 400);
    } else if (err) {
      return errorResponse(res, 'Error al procesar el logo: ' + err.message, 400);
    }

    try {
      const shopData = req.body;
      console.log('Received shop data for creation:', shopData);
      console.log('User from token:', req.user);
      console.log('File received:', req.file ? 'Yes' : 'No');

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
    const existingShop = await Shop.findOne({ subdomain: shopData.subdomain });
    if (existingShop) {
       return errorResponse(res, 'El subdominio ya está en uso', 400);
    }
    // --- End Validation ---

    // Ensure required fields are present (add more as needed)
    if (!shopData.shopName || !shopData.layoutDesign || !shopData.contactEmail || !shopData.shopPhone ) {
        return errorResponse(res, 'Faltan campos requeridos para crear la tienda.', 400);
    }

    // Parse templateUpdate if it's a string
    let templateUpdate = shopData.templateUpdate;
    if (typeof templateUpdate === 'string') {
      try {
        templateUpdate = JSON.parse(templateUpdate);
      } catch (e) {
        templateUpdate = {};
      }
    }

    const shopModelData = {
      name: shopData.shopName,
      description: shopData.description || '', // Provide default if optional
      category: shopData.category || 'other', // Provide default if optional
      address: shopData.address || '', // Dirección física
      subdomain: shopData.subdomain, // Subdominio http
      layoutDesign: shopData.layoutDesign,
      contactEmail: shopData.contactEmail,
      shopPhone: shopData.shopPhone,
      templateUpdate: templateUpdate && Object.keys(templateUpdate).length > 0 
        ? templateUpdate 
        : null, // Usar null en lugar de {} para indicar que no hay template configurado
      owner: userId,
      // active: true, // Default is true in model
      // imageUrl: null, // Default is null
    };

    // Si hay un logo, subirlo a Cloudinary
    if (req.file) {
      try {
        const logoUrl = await cloudinaryService.uploadImage(req.file.buffer, 'shop-logos');
        shopModelData.imageUrl = logoUrl;
        
        // También agregar logoUrl al templateUpdate
        if (!shopModelData.templateUpdate) {
          shopModelData.templateUpdate = {};
        }
        shopModelData.templateUpdate.logoUrl = logoUrl;
      } catch (uploadError) {
        console.error('Error al subir logo a Cloudinary:', uploadError);
        return errorResponse(res, 'Error al procesar el logo', 500);
      }
    }

    console.log('Attempting to save shop with data:', shopModelData);
    const newShop = new Shop(shopModelData);
    await newShop.save();

    console.log('Shop saved successfully:', newShop._id);

    user.shop = newShop._id;
    await user.save();
    console.log('User document updated with shop ID.');

    // Return the created shop data along with the success message
    return successResponse(res, {
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
  });
};

exports.getShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findById(id);
    
    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    return successResponse(res, { shop });
  } catch (err) {
    console.error('Error al obtener tienda:', err);
    return errorResponse(res, 'Error al obtener tienda', 500);
  }
};

exports.getPublicShop = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Buscando tienda pública con ID:', id);
    
    const shop = await Shop.findById(id);
    console.log('Tienda encontrada:', shop ? 'Sí' : 'No');
    
    if (!shop) {
      console.log('Tienda no encontrada en la base de datos');
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    console.log('Estado de la tienda - active:', shop.active);
    if (!shop.active) {
      console.log('Tienda existe pero no está activa');
      return errorResponse(res, 'Esta tienda no está disponible', 404);
    }

    // Incluir templateUpdate para obtener los estilos del usuario
    const shopData = {
      ...shop.toObject(),
      templateUpdate: shop.templateUpdate || null
    };

    console.log('Retornando datos de tienda pública exitosamente');
    return successResponse(res, { shop: shopData });
  } catch (err) {
    console.error('Error al obtener tienda pública:', err);
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
            if (updates.accentColor !== undefined) {
                shop.accentColor = updates.accentColor;
            }
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
    
    // Si hay logoUrl en el templateUpdate y no coincide con imageUrl del shop, sincronizar
    if (templateUpdate.logoUrl && user.shop.imageUrl !== templateUpdate.logoUrl) {
      user.shop.imageUrl = templateUpdate.logoUrl;
    }
    
    const merged = deepMerge({ ...current }, templateUpdate);
    user.shop.templateUpdate = merged;
    
    // Sincronizar ciertas propiedades del template con el modelo Shop
    const shopUpdates = {};
    
    // Sincronizar el nombre de la tienda (prioridad a shopName, luego title, luego storeName)
    if (templateUpdate.shopName) {
      shopUpdates.name = templateUpdate.shopName;
    } else if (templateUpdate.title) {
      shopUpdates.name = templateUpdate.title;
    } else if (templateUpdate.storeName) {
      shopUpdates.name = templateUpdate.storeName;
    }
    
    // Sincronizar la descripción de la tienda
    if (templateUpdate.storeDescription) {
      shopUpdates.description = templateUpdate.storeDescription;
    }
    
    // Sincronizar el slogan
    if (templateUpdate.storeSlogan) {
      shopUpdates.slogan = templateUpdate.storeSlogan;
    }
    
    // Los colores de estilado ahora se manejan solo en templateUpdate
    // No sincronizamos más con el modelo Shop
    
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
      return errorResponse(res, 'Tienda no encontrada para el usuario', 404);
    }
    
    // Si templateUpdate está vacío o no existe, devolver null para que el frontend use defaults
    let templateUpdate = user.shop.templateUpdate;
    const hasValidTemplate = templateUpdate && 
      typeof templateUpdate === 'object' && 
      Object.keys(templateUpdate).length > 0;
    
    // Si hay un template válido, asegurar que incluya el logo del shop
    if (hasValidTemplate) {
      templateUpdate = { ...templateUpdate };
      
      // Si el shop tiene imageUrl pero no hay logoUrl en el template, sincronizar
      if (user.shop.imageUrl && !templateUpdate.logoUrl) {
        templateUpdate.logoUrl = user.shop.imageUrl;
      }
    } else if (user.shop.imageUrl) {
      // Si no hay template pero sí hay imageUrl, crear un template básico con el logo
      templateUpdate = { logoUrl: user.shop.imageUrl };
    }
    
    return successResponse(res, { 
      templateUpdate: hasValidTemplate || user.shop.imageUrl ? templateUpdate : null 
    });
  } catch (error) {
    console.error('Error obteniendo template de tienda:', error);
    return errorResponse(res, 'Error obteniendo estilos de tienda', 500);
  }
};

// Actualizar credenciales de Mobbex para una tienda
exports.updateMobbexCredentials = async (req, res) => {
  try {
    const { id } = req.params;
    const { mobbexApiKey, mobbexAccessToken } = req.body;

    if (!mobbexApiKey || !mobbexAccessToken) {
      return errorResponse(res, 'Faltan credenciales de Mobbex', 400);
    }

    const shop = await Shop.findById(id);
    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    // Solo el dueño puede actualizar sus credenciales
    if (shop.owner.toString() !== req.user.id) {
      return errorResponse(res, 'No autorizado para modificar esta tienda', 403);
    }

    shop.mobbexApiKey = mobbexApiKey;
    shop.mobbexAccessToken = mobbexAccessToken;
    await shop.save();

    return successResponse(res, { message: 'Credenciales de Mobbex actualizadas correctamente' });
  } catch (err) {
    console.error('Error al actualizar credenciales de Mobbex:', err);
    return errorResponse(res, 'Error interno al actualizar credenciales de Mobbex', 500);
  }
};

// Verificar disponibilidad del nombre de la tienda
exports.checkShopNameAvailability = async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name || name.trim().length === 0) {
      return errorResponse(res, 'El nombre de la tienda es requerido', 400);
    }
    
    // Buscar si ya existe una tienda con ese nombre (case insensitive)
    const existingShop = await Shop.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    
    const isAvailable = !existingShop;
    
    return successResponse(res, { 
      available: isAvailable,
      name: name.trim()
    });
  } catch (err) {
    console.error('Error al verificar disponibilidad del nombre:', err);
    return errorResponse(res, 'Error interno al verificar disponibilidad', 500);
  }
};
