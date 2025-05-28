const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { createProduct, updateProduct, deleteProduct, getProducts, getProductById } = require('../controllers/product.controller');

// Obtener productos
router.get('/', verifyToken, getProducts);

// Obtener producto por ID
router.get('/:id', verifyToken, getProductById);

// Crear producto
router.post('/', verifyToken, createProduct);

// Editar producto
router.put('/:id', verifyToken, updateProduct);

// Eliminar producto
router.delete('/:id', verifyToken, deleteProduct);

module.exports = router;
