const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { createProduct, updateProduct, deleteProduct, getProducts, getProductById, addProductImages, deleteProductImage, getAllProducts } = require('../controllers/product.controller');

// Obtener productos
router.get('/', verifyToken, getProducts);

router.get('/all', getAllProducts);
// Obtener producto por ID
router.get('/:id', verifyToken, getProductById);

// Crear producto
router.post('/', verifyToken, createProduct);

// Editar producto
router.put('/:id', verifyToken, updateProduct);

// Eliminar producto
router.delete('/:id', verifyToken, deleteProduct);

// Ruta para agregar imágenes al producto (múltiples)
router.post('/:id/images', verifyToken, addProductImages);

// Ruta para eliminar una imagen específica del producto
router.delete('/:id/images', verifyToken, deleteProductImage);

// Obtener todos los productos (sin autenticación)

module.exports = router;
