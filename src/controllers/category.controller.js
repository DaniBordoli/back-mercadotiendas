const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/responseHelper');

// Crear una nueva categoría
exports.createCategory = async (req, res) => {
  try {
    const { name, description, parent, image } = req.body;

    if (!name) {
      return errorResponse(res, 'El nombre es obligatorio', 400);
    }

    const category = new Category({
      name,
      description,
      parent: parent || null,
      image: image || ''
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

// Obtener categorías principales (público - sin autenticación)
exports.getPublicMainCategories = async (req, res) => {
  try {
    const categories = await Category.find({
      $or: [{ parent: { $exists: false } }, { parent: null }]
    }).lean();
    return successResponse(res, categories, 'Categorías principales obtenidas exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener las categorías principales', 500, error.message);
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

// Obtener subcategorías por categoría padre
exports.getSubcategoriesByParent = async (req, res) => {
  try {
    const { parentId } = req.params;

    if (!parentId) {
      return errorResponse(res, 'ID de categoría padre requerido', 400);
    }

    // Validar que el parentId sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return errorResponse(res, 'ID de categoría padre inválido', 400);
    }

    // Verificar que la categoría padre existe
    const parentCategory = await Category.findById(parentId);
    if (!parentCategory) {
      return errorResponse(res, 'Categoría padre no encontrada', 404);
    }

    // Buscar subcategorías usando la nueva colección
    const subcategories = await Subcategory.findByCategory(parentId)
      .select('_id name description isActive order')
      .lean();
    
    console.log(`Subcategorías encontradas para categoría ${parentCategory.name} (${parentId}):`, subcategories.length);
    return successResponse(res, subcategories, 'Subcategorías obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener subcategorías:', error);
    return errorResponse(res, 'Error al obtener subcategorías', 500, error.message);
  }
};

// Actualizar una categoría
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parent, image } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }

    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent;
    if (image !== undefined) category.image = image;

    await category.save();
    return successResponse(res, category, 'Categoría actualizada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar la categoría', 500, error.message);
  }
};
