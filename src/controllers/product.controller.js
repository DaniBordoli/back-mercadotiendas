const Product = require('../models/Products');
const { successResponse, errorResponse } = require('../utils/response');
const cloudinaryService = require('../services/cloudinary.service');
const multer = require('multer');
const ProductVisit = require('../models/ProductVisit');
const LiveEventMetrics = require('../models/LiveEventMetrics');

// Configurar multer para manejar la carga de múltiples archivos en memoria para productos
const uploadProductImages = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB por archivo
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }
        cb(null, true);
    }
}).fields([
    { name: 'productImages', maxCount: 10 },
    { name: 'variantImages', maxCount: 20 }
]); // hasta 10 imágenes de producto y 20 de variantes

// Crear producto con imágenes
exports.createProduct = (req, res) => {
  uploadProductImages(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return errorResponse(res, 'Error al subir los archivos: ' + err.message, 400);
    } else if (err) {
      return errorResponse(res, 'Error al procesar los archivos: ' + err.message, 400);
    }

    try {
      const { nombre, descripcion, sku, estado, precio, oldPrice, discount, categoria, stock, subcategoria, codigoBarras, tieneVariantes } = req.body;
      
      // Procesar variantes
      let variantes = req.body.variantes;
      if (typeof variantes === 'string') {
        try { 
          variantes = JSON.parse(variantes); 
        } catch { 
          variantes = []; 
        }
      }
      if (!Array.isArray(variantes)) variantes = [];

      // Procesar combinaciones de variantes
      let combinacionesVariantes = req.body.combinacionesVariantes;
      if (typeof combinacionesVariantes === 'string') {
        try { 
          combinacionesVariantes = JSON.parse(combinacionesVariantes); 
        } catch { 
          combinacionesVariantes = []; 
        }
      }
      if (!Array.isArray(combinacionesVariantes)) combinacionesVariantes = [];

      console.log('[createProduct] req.files:', req.files); // <-- Depuración
      
      // Subir imágenes principales a Cloudinary si existen
      let productImages = [];
      if (req.files && req.files.productImages && req.files.productImages.length > 0) {
        for (const file of req.files.productImages) {
          const imageUrl = await cloudinaryService.uploadImage(file.buffer, 'products');
          productImages.push(imageUrl);
        }
      }
      
      // Procesar imágenes de variantes si existen
      let variantImageUrls = [];
      if (req.files && req.files.variantImages && req.files.variantImages.length > 0) {
        for (const file of req.files.variantImages) {
          const imageUrl = await cloudinaryService.uploadImage(file.buffer, 'products/variants');
          variantImageUrls.push(imageUrl);
        }
      }
      
      // Actualizar las URLs de imágenes en las combinaciones de variantes
      if (combinacionesVariantes && combinacionesVariantes.length > 0 && variantImageUrls.length > 0) {
        const variantImageIndexes = req.body.variantImageIndex;
        const indexes = Array.isArray(variantImageIndexes) ? variantImageIndexes : [variantImageIndexes];
        
        let imageIndex = 0;
        combinacionesVariantes.forEach((combo, index) => {
          if (indexes.includes(String(index)) && imageIndex < variantImageUrls.length) {
            combo.image = variantImageUrls[imageIndex];
            imageIndex++;
          }
        });
      }
      
      console.log('[createProduct] productImages:', productImages); // <-- Depuración

      // Obtener la tienda del usuario autenticado
      const user = req.user;
      if (!user || !user.shop) {
        return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
      }

      const product = new Product({
        nombre,
        descripcion,
        sku,
        estado,
        precio,
        categoria,
        oldPrice,
        discount,
        subcategoria,
        productImages,
        variantes,
        tieneVariantes: tieneVariantes === 'true' || tieneVariantes === true,
        combinacionesVariantes,
        stock: Number(stock), // Convertir stock a Number
        codigoBarras: codigoBarras || '', // Agregar código de barras
        shop: user.shop 
      });
      await product.save();
      return successResponse(res, product, 'Producto creado exitosamente');
    } catch (error) {
      console.log('Error al crear producto:', error);
      
      // Manejar error de SKU duplicado específicamente
      if (error.code === 11000) {
        if (error.keyPattern && error.keyPattern.sku) {
          return errorResponse(res, 'Ya existe un producto con este SKU. Por favor, usa un SKU diferente.', 400);
        }
        // Otros errores de duplicados
        return errorResponse(res, 'Ya existe un registro con estos datos. Por favor, verifica la información.', 400);
      }
      
      // Errores de validación de Mongoose
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return errorResponse(res, `Errores de validación: ${validationErrors.join(', ')}`, 400);
      }
      
      return errorResponse(res, 'Error al crear el producto', 500, error.message);
    }
  });
};


// Obtener todos los productos activos
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find({ estado: 'Activo' }).populate('shop', 'name');
    return successResponse(res, products, 'Productos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los productos', 500, error.message);
  }
};

// Obtener solo productos activos
exports.getActiveProducts = async (req, res) => {
  try {
    const products = await Product.find({ estado: 'Activo' }).populate('shop', 'name');
    return successResponse(res, products, 'Productos activos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener productos activos', 500);
  }
};

// Obtener productos de la tienda del usuario autenticado (para gestión)
exports.getMyProducts = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    
    // Permitir obtener todos los productos de la tienda, opcionalmente filtrar por estado si se pasa como query ?estado=Activo
    const { estado } = req.query;
    const query = { shop: user.shop };
    if (estado) {
      query.estado = estado;
    }

    const products = await Product.find(query).populate('shop', 'name');
    
    return successResponse(res, products, 'Productos de la tienda obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener productos de la tienda', 500);
  }
};


exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).populate('shop', 'name');
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }

    // Registrar la visita (no esperamos a que termine para responder)
    if (product.shop) {
      ProductVisit.create({ product: product._id, shop: product.shop }).catch(console.error);
    }

    // Incrementar clics en productos si se proporciona liveEventId
    const { liveEventId } = req.query;
    if (liveEventId) {
      // Incrementar clics a nivel de evento (métrica agregada)
      LiveEventMetrics.updateOne(
        { event: liveEventId },
        { $inc: { productClicks: 1 } },
        { upsert: true }
      ).catch(console.error);

      // Incrementar clics por producto destacado dentro del evento
      const LiveEventProductMetrics = require('../models/LiveEventProductMetrics');
      LiveEventProductMetrics.updateOne(
        { event: liveEventId, product: product._id },
        { $inc: { clicks: 1 } },
        { upsert: true }
      ).catch(console.error);
    }

    return successResponse(res, product, 'Producto obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el producto', 500, error.message);
  }
};


exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    // Solo permitir los campos editables
    const allowedFields = ['nombre', 'sku', 'descripcion', 'precio', 'oldPrice', 'discount', 'stock', 'categoria', 'subcategoria', 'estado', 'productImages', 'variantes', 'codigoBarras'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Procesar variantes como array
        if (field === 'variantes') {
          let value = req.body[field];
          if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch { value = []; }
          }
          if (!Array.isArray(value)) value = [];
          updates[field] = value;
        } else if (field === 'stock') { // Asegurar que el stock se convierta a número
          updates[field] = Number(req.body[field]);
        } else {
          updates[field] = req.body[field];
        }
      }
    });
    const product = await Product.findOneAndUpdate({ _id: id, shop: user.shop }, updates, { new: true });
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    return successResponse(res, product, 'Producto actualizado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar el producto', 500, error.message);
  }
};


exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    const product = await Product.findOneAndDelete({ _id: id, shop: user.shop });
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    return successResponse(res, null, 'Producto eliminado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar el producto', 500, error.message);
  }
};


exports.addProductImages = async (req, res) => {
    uploadProductImages(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return errorResponse(res, 'Error al subir los archivos: ' + err.message, 400);
        } else if (err) {
            return errorResponse(res, 'Error al procesar los archivos: ' + err.message, 400);
        }

        try {
            const uploadedFiles = req.files && (req.files.productImages || req.files);
            if (!uploadedFiles || uploadedFiles.length === 0) {
                return errorResponse(res, 'No se subió ningún archivo', 400);
            }

            const { id } = req.params;
            const user = req.user;
            if (!user || !user.shop) {
              return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
            }
            const product = await Product.findOne({ _id: id, shop: user.shop });
            if (!product) {
                return errorResponse(res, 'Producto no encontrado', 404);
            }

            // Subir todas las imágenes a Cloudinary y agregar las URLs al array
            const urls = [];
            const imagesToUpload = req.files.productImages || req.files || [];
            for (const file of imagesToUpload) {
                const imageUrl = await cloudinaryService.uploadImage(file.buffer, 'products');
                urls.push(imageUrl);
            }
            product.productImages = product.productImages.concat(urls);
            await product.save();

            return successResponse(res, { productImages: product.productImages }, 'Imágenes del producto agregadas exitosamente');
        } catch (error) {
            return errorResponse(res, 'Error al agregar imágenes al producto', 500, error.message);
        }
    });
};

/**
 * Actualiza el stock de un producto.
 * @param {string} productId - ID del producto a actualizar.
 * @param {number} quantityToReduce - Cantidad a reducir del stock.
 */
exports.updateProductStock = async (productId, quantityToReduce) => {
  try {
    // Validar que productId sea un ObjectId válido
    if (!productId || !productId.toString().match(/^[0-9a-fA-F]{24}$/)) {
      console.warn(`[Stock Update] ProductId inválido: ${productId}`);
      return { success: false, message: 'ProductId inválido' };
    }

    const product = await Product.findById(productId);

    if (!product) {
      console.warn(`[Stock Update] Producto no encontrado con ID: ${productId}`);
      return { success: false, message: 'Producto no encontrado' };
    }

    if (product.stock < quantityToReduce) {
      console.warn(`[Stock Update] Stock insuficiente para producto ${productId}. Stock actual: ${product.stock}, intento de reducir: ${quantityToReduce}`);
      // No lanzar error, solo advertir y continuar
      return { success: false, message: 'Stock insuficiente' };
    }

    product.stock -= quantityToReduce;
    await product.save();
    console.log(`[Stock Update] Stock de producto ${productId} actualizado. Nuevo stock: ${product.stock}`);
    return { success: true, newStock: product.stock };
  } catch (error) {
    console.error(`[Stock Update] Error al actualizar stock para producto ${productId}:`, error);
    // No lanzar error, solo loggearlo y continuar
    return { success: false, message: `Error al actualizar stock: ${error.message}` };
  }
};


exports.deleteProductImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { imageUrl } = req.body;
        const user = req.user;
        if (!user || !user.shop) {
          return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
        }
        if (!imageUrl) {
            return errorResponse(res, 'URL de imagen requerida', 400);
        }
        const product = await Product.findOne({ _id: id, shop: user.shop });
        if (!product) {
            return errorResponse(res, 'Producto no encontrado', 404);
        }
        // Eliminar la imagen de Cloudinary
        try {
            await cloudinaryService.deleteImage(imageUrl);
        } catch (error) {
            // Ignorar error de borrado
        }
        // Eliminar la URL del array
        product.productImages = product.productImages.filter(url => url !== imageUrl);
        await product.save();
        return successResponse(res, { productImages: product.productImages }, 'Imagen eliminada exitosamente');
    } catch (error) {
        return errorResponse(res, 'Error al eliminar la imagen del producto', 500, error.message);
    }
};

// Obtener todos los productos (sin filtrar por tienda) - solo productos activos
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({ estado: 'Activo' }).populate('shop', 'name');
    return successResponse(res, products, 'Todos los productos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener todos los productos', 500, error.message);
  }
};

// Obtener productos de una tienda específica (sin autenticación) - solo productos activos
exports.getProductsByShop = async (req, res) => {
  try {
    const { shopId } = req.params;
    
    if (!shopId) {
      return errorResponse(res, 'ID de tienda requerido', 400);
    }
    
    const products = await Product.find({ 
      shop: shopId, 
      estado: 'Activo' 
    }).populate('shop', 'name');
    
    return successResponse(res, products, 'Productos de la tienda obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los productos de la tienda', 500, error.message);
  }
};

// Obtener el total de visitas del mes actual para la tienda del usuario autenticado
exports.getMonthlyVisits = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }

    // Calcular inicio y fin del mes actual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const resultado = await ProductVisit.aggregate([
      {
        $match: {
          shop: user.shop,
          visitedAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const totalVisitasMes = resultado.length > 0 ? resultado[0].total : 0;

    return successResponse(res, { totalVisitasMes }, 'Visitas del mes obtenidas exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener las visitas del mes', 500, error.message);
  }
};

// appended at end
exports.getProductByIdPublic = exports.getProductById;
