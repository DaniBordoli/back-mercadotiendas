const { createCheckout, checkPaymentStatus, processWebhook } = require('../services/mobbex.service');
const { successResponse, errorResponse } = require('../utils/response');
const Payment = require('../models/Payment');

/**
 * Crea un checkout para un pedido
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const createOrderCheckout = async (req, res) => {
  try {
    console.log('=== BACKEND: Recibiendo request de checkout ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body completo:', JSON.stringify(req.body, null, 2));
    console.log('Usuario autenticado:', req.user);

    const { orderData, customerData, items } = req.body;

    console.log('=== BACKEND: Datos extraídos del body ===');
    console.log('orderData:', JSON.stringify(orderData, null, 2));
    console.log('customerData:', JSON.stringify(customerData, null, 2));
    console.log('items:', JSON.stringify(items, null, 2));

    // Validaciones básicas
    if (!orderData || !orderData.total) {
      return errorResponse(res, 'El monto total es requerido', 400);
    }

    if (!customerData || !customerData.email) {
      return errorResponse(res, 'El email del cliente es requerido', 400);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse(res, 'Se requiere al menos un item en el pedido', 400);
    }

    // Añadir referencia al usuario actual
    if (req.user && req.user.id) {
      if (!orderData.reference) {
        orderData.reference = `user_${req.user.id}_${Date.now()}`;
      }
    }

    // Crear checkout en Mobbex
    console.log('=== BACKEND: Llamando al servicio de Mobbex ===');
    const checkoutData = await createCheckout(orderData, customerData, items);

    console.log('=== BACKEND: Respuesta del servicio Mobbex ===');
    console.log('checkoutData:', JSON.stringify(checkoutData, null, 2));

    return successResponse(res, checkoutData, 'Checkout creado exitosamente');
  } catch (error) {
    console.error('=== BACKEND: Error en createOrderCheckout ===');
    console.error('Error completo:', error);
    console.error('Stack trace:', error.stack);
    
    return errorResponse(res, 'Error al crear el checkout', 500, error.message);
  }
};

/**
 * Verifica el estado de un pago
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return errorResponse(res, 'El ID de la operación es requerido', 400);
    }

    // Primero buscamos si ya tenemos el pago registrado en nuestra base de datos
    const existingPayment = await Payment.findOne({ mobbexId: id });
    
    if (existingPayment) {
      return successResponse(res, existingPayment, 'Estado del pago obtenido desde la base de datos');
    }

    // Si no existe en nuestra base de datos, consultamos a Mobbex
    const paymentStatus = await checkPaymentStatus(id);

    return successResponse(res, paymentStatus, 'Estado del pago obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al verificar el estado del pago', 500, error.message);
  }
};

/**
 * Maneja los webhooks de Mobbex
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const handleWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    // Procesar el webhook
    const paymentInfo = processWebhook(webhookData);
    
    // Verificar si ya existe este pago en nuestra base de datos
    let payment = await Payment.findOne({ mobbexId: paymentInfo.id });
    
    if (payment) {
      // Actualizar el pago existente
      payment.status = paymentInfo.status;
      payment.paymentMethod = paymentInfo.paymentMethod;
      payment.updatedAt = new Date();
      
      await payment.save();
      console.log('Pago actualizado:', payment._id);
    } else {
      // Extraer el ID de usuario de la referencia o de los datos del cliente
      // Esto dependerá de cómo estés estructurando tus referencias
      // Por ejemplo, si la referencia tiene formato "user_123_order_456"
      let userId;
      
      if (paymentInfo.reference && paymentInfo.reference.includes('_')) {
        const parts = paymentInfo.reference.split('_');
        if (parts.length >= 2) {
          userId = parts[1]; // Asumiendo formato "user_123_..."
        }
      }
      
      // Si no se pudo extraer el ID de la referencia, podríamos buscarlo por email
      if (!userId && paymentInfo.customer && paymentInfo.customer.email) {
        const User = require('../models/User');
        const user = await User.findOne({ email: paymentInfo.customer.email });
        if (user) {
          userId = user._id;
        }
      }
      
      // Crear un nuevo registro de pago
      if (userId) {
        payment = new Payment({
          user: userId,
          mobbexId: paymentInfo.id,
          reference: paymentInfo.reference,
          amount: paymentInfo.amount,
          currency: paymentInfo.currency,
          status: paymentInfo.status,
          paymentMethod: paymentInfo.paymentMethod,
          paymentData: webhookData.data,
          createdAt: paymentInfo.createdAt
        });
        
        await payment.save();
        console.log('Nuevo pago registrado:', payment._id);
      } else {
        console.warn('No se pudo identificar el usuario para el pago:', paymentInfo.id);
      }
    }

    // Siempre responder con éxito al webhook para que Mobbex no reintente
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    // Aún con error, respondemos 200 para evitar reintentos
    return res.status(200).json({ success: false, error: error.message });
  }
};

/**
 * Obtiene el historial de pagos de un usuario
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const getUserPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const payments = await Payment.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
    
    return successResponse(res, payments, 'Historial de pagos obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el historial de pagos', 500, error.message);
  }
};

module.exports = {
  createOrderCheckout,
  getPaymentStatus,
  handleWebhook,
  getUserPayments
};
