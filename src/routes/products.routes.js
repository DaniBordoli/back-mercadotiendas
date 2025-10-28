const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { createProduct, updateProduct, deleteProduct, getProducts, getProductById, getProductByIdPublic, getMonthlyVisits, addProductImages, deleteProductImage, getAllProducts, getActiveProducts, getProductsByShop, getMyProducts } = require('../controllers/product.controller');

// Obtener productos
router.get('/', getProducts);

// Obtener solo productos activos
router.get('/active', getActiveProducts);

// Obtener productos de la tienda del usuario autenticado (para gestión)
router.get('/my-products', verifyToken, getMyProducts);

// Obtener todos los productos de todas las tiendas (sin autenticación)
router.get('/all', getAllProducts);

// Obtener productos de una tienda específica (sin autenticación)
router.get('/shop/:shopId', getProductsByShop);
// Obtener producto por ID (ruta pública y registra visita)
router.get('/public/:id', getProductByIdPublic);
// Obtener producto por ID (autenticado, para gestión)
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
// Obtener visitas del mes para la tienda del usuario autenticado
router.get('/my-products/visitas-mes', verifyToken, getMonthlyVisits);

module.exports = router;
