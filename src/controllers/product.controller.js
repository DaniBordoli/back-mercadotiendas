const Product = require('../models/Products');
const { successResponse, errorResponse } = require('../utils/response');
const cloudinaryService = require('../services/cloudinary.service');
const multer = require('multer');

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
}).array('productImages', 10); // hasta 10 imágenes por vez

// Crear producto con imágenes
exports.createProduct = (req, res) => {
  uploadProductImages(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return errorResponse(res, 'Error al subir los archivos: ' + err.message, 400);
    } else if (err) {
      return errorResponse(res, 'Error al procesar los archivos: ' + err.message, 400);
    }

    try {
      const { nombre, descripcion, sku, estado, precio, categoria, stock, subcategoria } = req.body;
      
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

      console.log('[createProduct] req.files:', req.files); // <-- Depuración
      let productImages = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const imageUrl = await cloudinaryService.uploadImage(file.buffer, 'products');
          productImages.push(imageUrl);
        }
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
        subcategoria,
        productImages,
        variantes,
        stock,
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


exports.getProducts = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    // Cambiado: populate para traer el nombre de la tienda
    const products = await Product.find({ shop: user.shop }).populate('shop', 'name');
    return successResponse(res, products, 'Productos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los productos', 500, error.message);
  }
};

// Nuevo método para obtener solo productos activos de una tienda
exports.getActiveProducts = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    const products = await Product.find({ 
      shop: user.shop, 
      estado: 'Activo'
    }).populate('shop', 'name');
    return successResponse(res, products, 'Productos activos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los productos activos', 500, error.message);
  }
};


exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    // Cambiado: populate para traer el nombre de la tienda
    const product = await Product.findOne({ _id: id, shop: user.shop }).populate('shop', 'name');
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
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
    const allowedFields = ['nombre', 'sku', 'descripcion', 'precio', 'stock', 'categoria', 'estado', 'productImages', 'variantes'];
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
            if (!req.files || req.files.length === 0) {
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
            for (const file of req.files) {
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
