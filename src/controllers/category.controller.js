const Category = require('../models/Category');
const { successResponse, errorResponse } = require('../utils/response');

// Crear una nueva categoría
exports.createCategory = async (req, res) => {
  try {
    const { name, description, image, status, parent } = req.body;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    if (!name) {
      return errorResponse(res, 'El nombre es obligatorio', 400);
    }
    const category = new Category({
      name,
      description,
      image,
      status,
      parent: parent || null,
      shop: user.shop
    });
    await category.save();
    return successResponse(res, category, 'Categoría creada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al crear la categoría', 500, error.message);
  }
};

// Eliminar una categoría
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }
    return successResponse(res, null, 'Categoría eliminada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar la categoría', 500, error.message);
  }
};

// Obtener todas las categorías
exports.getAllCategories = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    const categories = await Category.find({ shop: user.shop }).lean();
    return successResponse(res, categories, 'Categorías obtenidas exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener las categorías', 500, error.message);
  }
};

// Obtener una categoría por ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    const category = await Category.findOne({ _id: id, shop: user.shop }).lean();
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }
    return successResponse(res, category, 'Categoría obtenida exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener la categoría', 500, error.message);
  }
};
