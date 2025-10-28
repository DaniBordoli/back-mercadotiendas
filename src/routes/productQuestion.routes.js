const express = require('express');
const router = express.Router();
const {
  createQuestion,
  getQuestionsByProduct,
  deleteQuestion,
  answerQuestion } = require('../controllers/productQuestion.controller');
const { verifyToken } = require('../middlewares/auth');

// Crear una nueva pregunta (requiere autenticación)
router.post('/', verifyToken, createQuestion);

// Obtener preguntas de un producto (público)
router.get('/product/:productId', getQuestionsByProduct);

// Eliminar una pregunta (requiere ser autor)
router.delete('/:questionId', verifyToken, deleteQuestion);

// Responder una pregunta (requiere autenticación y ser vendedor de la tienda del producto)
router.patch('/:questionId/answer', verifyToken, answerQuestion);

module.exports = router;