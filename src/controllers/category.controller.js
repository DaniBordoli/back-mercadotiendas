const Category = require('../models/Category');
const { successResponse, errorResponse } = require('../utils/response');

// Crear una nueva categoría
exports.createCategory = async (req, res) => {
  try {
    const { name, description, parent } = req.body;
    
    if (!name) {
      return errorResponse(res, 'El nombre es obligatorio', 400);
    }
    
    const category = new Category({
      name,
      description,
      parent: parent || null
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
    const categories = await Category.find({}).lean();
    return successResponse(res, categories, 'Categorías obtenidas exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener las categorías', 500, error.message);
  }
};

// Obtener una categoría por ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findById(id).lean();
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }
    
    return successResponse(res, category, 'Categoría obtenida exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener la categoría', 500, error.message);
  }
};

// Actualizar una categoría
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parent } = req.body;
    
    const category = await Category.findById(id);
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }
    
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent;
    
    await category.save();
    return successResponse(res, category, 'Categoría actualizada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar la categoría', 500, error.message);
  }
};
