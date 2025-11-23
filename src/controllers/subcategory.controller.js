const Subcategory = require('../models/Subcategory');
const Category = require('../models/Category');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const mongoose = require('mongoose');

// Crear una nueva subcategoría
exports.createSubcategory = async (req, res) => {
  try {
    const { name, description, category, order } = req.body;

    // Validar campos requeridos
    if (!name || !category) {
      return errorResponse(res, 'Nombre y categoría son requeridos', 400);
    }

    // Validar que la categoría existe
    const parentCategory = await Category.findById(category);
    if (!parentCategory) {
      return errorResponse(res, 'Categoría padre no encontrada', 404);
    }

    // Verificar que no existe una subcategoría con el mismo nombre en la misma categoría
    const existingSubcategory = await Subcategory.findOne({ 
      name: name.trim(), 
      category: category 
    });
    
    if (existingSubcategory) {
      return errorResponse(res, 'Ya existe una subcategoría con ese nombre en esta categoría', 400);
    }

    // Crear nueva subcategoría
    const subcategory = new Subcategory({
      name: name.trim(),
      description: description?.trim() || '',
      category,
      order: order || 0
    });

    await subcategory.save();
    
    return successResponse(res, subcategory, 'Subcategoría creada exitosamente', 201);
  } catch (error) {
    console.error('Error al crear subcategoría:', error);
    return errorResponse(res, 'Error al crear subcategoría', 500, error.message);
  }
};

// Obtener todas las subcategorías
exports.getAllSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find({ isActive: true })
      .populate('category', 'name description')
      .sort({ 'category.name': 1, order: 1, name: 1 })
      .lean();
    
    return successResponse(res, subcategories, 'Subcategorías obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener subcategorías:', error);
    return errorResponse(res, 'Error al obtener subcategorías', 500, error.message);
  }
};

// Obtener subcategorías por categoría
exports.getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return errorResponse(res, 'ID de categoría requerido', 400);
    }

    // Validar que el categoryId sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return errorResponse(res, 'ID de categoría inválido', 400);
    }

    // Verificar que la categoría existe
    const category = await Category.findById(categoryId);
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }

    // Buscar subcategorías
    const subcategories = await Subcategory.findByCategory(categoryId)
      .select('_id name description isActive order')
      .lean();
    
    console.log(`Subcategorías encontradas para categoría ${category.name} (${categoryId}):`, subcategories.length);
    return successResponse(res, subcategories, 'Subcategorías obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener subcategorías:', error);
    return errorResponse(res, 'Error al obtener subcategorías', 500, error.message);
  }
};

// Obtener una subcategoría por ID
exports.getSubcategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 'ID de subcategoría inválido', 400);
    }

    const subcategory = await Subcategory.findById(id)
      .populate('category', 'name description')
      .lean();

    if (!subcategory) {
      return errorResponse(res, 'Subcategoría no encontrada', 404);
    }

    return successResponse(res, subcategory, 'Subcategoría obtenida exitosamente');
  } catch (error) {
    console.error('Error al obtener subcategoría:', error);
    return errorResponse(res, 'Error al obtener subcategoría', 500, error.message);
  }
};

// Actualizar una subcategoría
exports.updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, order, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 'ID de subcategoría inválido', 400);
    }

    // Buscar la subcategoría
    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return errorResponse(res, 'Subcategoría no encontrada', 404);
    }

    // Si se está cambiando la categoría, validar que existe
    if (category && category !== subcategory.category.toString()) {
      const parentCategory = await Category.findById(category);
      if (!parentCategory) {
        return errorResponse(res, 'Categoría padre no encontrada', 404);
      }
    }

    // Si se está cambiando el nombre, verificar que no existe otra subcategoría con el mismo nombre
    if (name && name.trim() !== subcategory.name) {
      const existingSubcategory = await Subcategory.findOne({ 
        name: name.trim(), 
        category: category || subcategory.category,
        _id: { $ne: id }
      });
      
      if (existingSubcategory) {
        return errorResponse(res, 'Ya existe una subcategoría con ese nombre en esta categoría', 400);
      }
    }

    // Actualizar campos
    if (name) subcategory.name = name.trim();
    if (description !== undefined) subcategory.description = description.trim();
    if (category) subcategory.category = category;
    if (order !== undefined) subcategory.order = order;
    if (isActive !== undefined) subcategory.isActive = isActive;

    await subcategory.save();
    
    // Obtener la subcategoría actualizada con la categoría populada
    const updatedSubcategory = await Subcategory.findById(id)
      .populate('category', 'name description')
      .lean();

    return successResponse(res, updatedSubcategory, 'Subcategoría actualizada exitosamente');
  } catch (error) {
    console.error('Error al actualizar subcategoría:', error);
    return errorResponse(res, 'Error al actualizar subcategoría', 500, error.message);
  }
};

// Eliminar una subcategoría (soft delete)
exports.deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 'ID de subcategoría inválido', 400);
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return errorResponse(res, 'Subcategoría no encontrada', 404);
    }

    // Soft delete
    subcategory.isActive = false;
    await subcategory.save();

    return successResponse(res, null, 'Subcategoría eliminada exitosamente');
  } catch (error) {
    console.error('Error al eliminar subcategoría:', error);
    return errorResponse(res, 'Error al eliminar subcategoría', 500, error.message);
  }
};

// Reactivar una subcategoría
exports.reactivateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 'ID de subcategoría inválido', 400);
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return errorResponse(res, 'Subcategoría no encontrada', 404);
    }

    subcategory.isActive = true;
    await subcategory.save();

    const reactivatedSubcategory = await Subcategory.findById(id)
      .populate('category', 'name description')
      .lean();

    return successResponse(res, reactivatedSubcategory, 'Subcategoría reactivada exitosamente');
  } catch (error) {
    console.error('Error al reactivar subcategoría:', error);
    return errorResponse(res, 'Error al reactivar subcategoría', 500, error.message);
  }
};