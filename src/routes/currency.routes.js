const express = require('express');
const router = express.Router();
const {
  getCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency
} = require('../controllers/currency.controller');
const { verifyToken } = require('../middlewares/auth');

// Obtener todas las monedas
router.get('/', verifyToken, getCurrencies);

// Crear moneda
router.post('/', verifyToken, createCurrency);

// Actualizar moneda
router.put('/:id', verifyToken, updateCurrency);

// Eliminar moneda
router.delete('/:id', verifyToken, deleteCurrency);

module.exports = router;

module.exports = router;
