const express = require('express');
const router = express.Router();
const subcategoryController = require('../controllers/subcategory.controller');
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');

// Rutas públicas (solo lectura)
router.get('/', subcategoryController.getAllSubcategories);
router.get('/category/:categoryId', subcategoryController.getSubcategoriesByCategory);
router.get('/:id', subcategoryController.getSubcategoryById);

// Rutas protegidas (requieren autenticación y rol de administrador)
router.post('/', verifyToken, requireAdmin, subcategoryController.createSubcategory);
router.put('/:id', verifyToken, requireAdmin, subcategoryController.updateSubcategory);
router.delete('/:id', verifyToken, requireAdmin, subcategoryController.deleteSubcategory);
router.patch('/:id/reactivate', verifyToken, requireAdmin, subcategoryController.reactivateSubcategory);

module.exports = router;