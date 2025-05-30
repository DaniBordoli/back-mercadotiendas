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
      const { nombre, descripcion, sku, estado, precio, categoria, subcategoria } = req.body;
      // Procesar color y talle como arrays
      let color = req.body.color;
      let talle = req.body.talle;
      if (typeof color === 'string') {
        try { color = JSON.parse(color); } catch { color = [color]; }
      }
      if (!Array.isArray(color)) color = color ? [color] : [];
      if (typeof talle === 'string') {
        try { talle = JSON.parse(talle); } catch { talle = [talle]; }
      }
      if (!Array.isArray(talle)) talle = talle ? [talle] : [];
      console.log('[createProduct] req.files:', req.files); // <-- Depuración
      let productImages = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const imageUrl = await cloudinaryService.uploadImage(file.buffer, 'products');
          productImages.push(imageUrl);
        }
      }
      console.log('[createProduct] productImages:', productImages); // <-- Depuración
      const product = new Product({
        nombre,
        descripcion,
        sku,
        estado,
        precio,
        categoria,
        subcategoria,
        productImages,
        color,
        talle
      });
      await product.save();
      return successResponse(res, product, 'Producto creado exitosamente');
    } catch (error) {
      return errorResponse(res, 'Error al crear el producto', 500, error);
    }
  });
};

// Obtener productos
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    return successResponse(res, products, 'Productos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los productos', 500, error.message);
  }
};

// Obtener producto por ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    return successResponse(res, product, 'Producto obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el producto', 500, error.message);
  }
};

// Editar producto
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    // Solo permitir los campos editables
    const allowedFields = ['nombre', 'sku', 'descripcion', 'precio', 'stock', 'categoria', 'estado', 'productImages', 'color', 'talle'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Procesar color y talle como arrays
        if ((field === 'color' || field === 'talle')) {
          let value = req.body[field];
          if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch { value = [value]; }
          }
          if (!Array.isArray(value)) value = value ? [value] : [];
          updates[field] = value;
        } else {
          updates[field] = req.body[field];
        }
      }
    });
    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    return successResponse(res, product, 'Producto actualizado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar el producto', 500, error.message);
  }
};

// Eliminar producto
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    return successResponse(res, null, 'Producto eliminado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar el producto', 500, error.message);
  }
};

// Nueva función para agregar imágenes al producto
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
            const product = await Product.findById(id);
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

// Nueva función para eliminar una imagen específica del producto
exports.deleteProductImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return errorResponse(res, 'URL de imagen requerida', 400);
        }
        const product = await Product.findById(id);
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
