const ProductQuestion = require('../models/ProductQuestion');
const { successResponse, errorResponse } = require('../utils/response');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const Product = require('../models/Products');

// Create a new question
exports.createQuestion = async (req, res) => {
  try {
    const { productId, question } = req.body;
    const userId = req.userId; // set by verifyToken middleware

    if (!productId || !question) {
      return errorResponse(res, 'productId y question son requeridos', 400);
    }

    const newQuestion = new ProductQuestion({
      userId,
      productId,
      question,
    });

    await newQuestion.save();

    // Notificar al dueño de la tienda sobre la nueva pregunta
    try {
      const io = req.app.get('io');
      const product = await Product.findById(productId).populate('shop');
      if (
        io &&
        product &&
        product.shop &&
        product.shop.owner &&
        product.shop.owner.toString() !== userId
      ) {
        await NotificationService.emitAndPersist(io, {
          users: [product.shop.owner],
          type: NotificationTypes.QUESTION,
          title: 'Nueva pregunta sobre tu producto',
          message: `Han realizado una pregunta sobre tu producto ${(product.nombre || product.name || '')}`,
          entity: product._id,
          data: { productName: (product.nombre || product.name || ''), questionText: newQuestion.question || '' },
        });
      }
    } catch (notifyErr) {
      console.error('Error enviando notificación de nueva pregunta:', notifyErr);
    }

    return successResponse(res, {
      message: 'Pregunta creada exitosamente',
      question: newQuestion,
    });
  } catch (err) {
    console.error('Error al crear pregunta:', err);
    return errorResponse(res, 'Error al crear pregunta', 500);
  }
};

// Get questions by product id
exports.getQuestionsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const questions = await ProductQuestion.find({ productId })
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 });

    return successResponse(res, { questions });
  } catch (err) {
    console.error('Error al obtener preguntas:', err);
    return errorResponse(res, 'Error al obtener preguntas', 500);
  }
};

// Delete question (only author or later seller can be implemented)
exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.userId;

    const question = await ProductQuestion.findById(questionId);
    if (!question) {
      return errorResponse(res, 'Pregunta no encontrada', 404);
    }

    if (question.userId.toString() !== userId) {
      return errorResponse(res, 'No autorizado', 403);
    }

    await question.remove();

    return successResponse(res, { message: 'Pregunta eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar pregunta:', err);
    return errorResponse(res, 'Error al eliminar pregunta', 500);
  }
};

// Responder una pregunta (solo vendedor de la tienda puede responder)
exports.answerQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answer } = req.body;
    const user = req.user;

    if (!answer || !answer.trim()) {
      return errorResponse(res, 'La respuesta es requerida', 400);
    }

    // Buscar la pregunta
    const question = await ProductQuestion.findById(questionId);
    if (!question) {
      return errorResponse(res, 'Pregunta no encontrada', 404);
    }

    // Verificar que el producto pertenezca a la tienda del usuario autenticado
    const product = await Product.findById(question.productId).select('shop name');
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }

    if (!user.shop || user.shop.toString() !== product.shop.toString()) {
      return errorResponse(res, 'No autorizado para responder esta pregunta', 403);
    }

    if (question.answer) {
      return errorResponse(res, 'La pregunta ya fue respondida', 400);
    }

    // Guardar la respuesta
    question.answer = answer.trim();
    question.answeredAt = new Date();
    await question.save();

    // Notificar al autor de la pregunta sobre la respuesta
    try {
      const io = req.app.get('io');
      if (io && question.userId.toString() !== user._id.toString()) {
        await NotificationService.emitAndPersist(io, {
          users: [question.userId],
          type: NotificationTypes.QUESTION,
          title: 'Tu pregunta ha sido respondida',
          message: 'El vendedor ha respondido tu pregunta sobre el producto.',
          entity: question.productId,
          data: { productName: (product.nombre || product.name || ''), questionText: question.question || '' },
        });
      }
    } catch (notifyErr) {
      console.error('Error enviando notificación de respuesta de pregunta:', notifyErr);
    }

    return successResponse(res, { question }, 'Respuesta enviada exitosamente');
  } catch (err) {
    console.error('Error al responder pregunta:', err);
    return errorResponse(res, 'Error al responder pregunta', 500);
  }
};
