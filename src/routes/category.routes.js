const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { verifyToken } = require('../middlewares/auth');

// Crear categoría
router.post('/', verifyToken, categoryController.createCategory);
// Eliminar categoría
router.delete('/:id', verifyToken, categoryController.deleteCategory);
// Obtener todas las categorías
router.get('/', verifyToken, categoryController.getAllCategories);
// Obtener subcategorías por categoría padre
router.get('/:parentId/subcategories', verifyToken, categoryController.getSubcategoriesByParent);
// Obtener una categoría por ID
router.get('/:id', verifyToken, categoryController.getCategoryById);
// Actualizar categoría
router.put('/:id', verifyToken, categoryController.updateCategory);

module.exports = router;
