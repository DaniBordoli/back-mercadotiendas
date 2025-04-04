const express = require('express');
const router = express.Router();
const { createShop, getShop, updateShop, deleteShop } = require('../controllers/shop.controller');
const { verifyToken } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Crear tienda
router.post('/', createShop);

// Obtener tienda por ID
router.get('/:id', getShop);

// Actualizar tienda
router.put('/:id', updateShop);

// Eliminar tienda
router.delete('/:id', deleteShop);

module.exports = router;
