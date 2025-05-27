const Product = require('../models/Products');
const { successResponse, errorResponse } = require('../utils/response');

// Crear producto
exports.createProduct = async (req, res) => {
  try {
    console.log('Datos recibidos en createProduct:', req.body);
    const { nombre, descripcion, sku, estado, precio, categoria, subcategoria } = req.body;
    const product = new Product({ nombre, descripcion, sku, estado, precio, categoria, subcategoria });
    await product.save();
    return successResponse(res, product, 'Producto creado exitosamente');
  } catch (error) {
    console.error('Error en createProduct:', error);
    return errorResponse(res, 'Error al crear el producto', 500, error);
  }
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
    const allowedFields = ['nombre', 'sku', 'descripcion', 'precio', 'stock', 'categoria', 'estado'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
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
