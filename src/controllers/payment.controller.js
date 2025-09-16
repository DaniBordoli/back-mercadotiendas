// Comentamos Mobbex y usamos el servicio mock
// const { createCheckout, checkPaymentStatus, processWebhook } = require('../services/mobbex.service');
const { createCheckout, checkPaymentStatus, processWebhook, simulateSuccessfulWebhook } = require('../services/mock-payment.service');
const { successResponse, errorResponse } = require('../utils/response');
const Payment = require('../models/Payment');
const Shop = require('../models/Shop');
const { updateProductStock } = require('./product.controller'); // Importar la función de stock
const axios = require('axios');
// const mobbexConfig = require('../config/mobbex'); // No necesario para mock

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

    const userId = req.user && req.user.id ? req.user.id : null;

    // Obtener la tienda del usuario autenticado
    const userShop = req.user && req.user.shop ? req.user.shop : null;
    let shop = null;
    if (userShop) {
      shop = await Shop.findById(userShop);
    }
    if (!shop) {
      return errorResponse(res, 'No se encontró la tienda asociada al usuario', 400);
    }

    // Preparar ítems para guardar en la base de datos, incluyendo productId del frontend
    const paymentItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.price,
      productName: item.name,
      productImage: item.image
    }));

    // Generar una referencia única para el pedido que se enviará a Mobbex
    orderData.reference = `order_${Date.now()}`;

    // Crear checkout usando el servicio mock (reemplaza Mobbex temporalmente)
    console.log('=== BACKEND: Ítems enviados al servicio mock desde controller ===', JSON.stringify(items, null, 2));
    console.log('=== BACKEND: Llamando al servicio de pago mock ===');
    const checkoutResponse = await createCheckout(orderData, customerData, items, {
      // Las credenciales no son necesarias para el mock, pero mantenemos la estructura
      mobbexApiKey: shop.mobbexApiKey || 'mock_api_key',
      mobbexAccessToken: shop.mobbexAccessToken || 'mock_access_token'
    });

    console.log('=== BACKEND: Respuesta del servicio mock ===');
    console.log('checkoutResponse:', JSON.stringify(checkoutResponse, null, 2));

    // Si el checkout mock fue exitoso, crear y guardar el registro de pago en nuestra DB
    if (checkoutResponse.success && checkoutResponse.data.id) {
      const newPayment = new Payment({
        user: userId,
        mobbexId: checkoutResponse.data.id, // Usamos el ID del mock
        reference: orderData.reference, // La referencia que enviamos al mock
        amount: orderData.total,
        currency: orderData.currency || 'ARS',
        // Se asegura que el código de estado inicial siempre esté presente.
        status: { code: '1', text: 'Mock Checkout Creado' }, // Usar estado del mock
        paymentMethod: null, // El mock no devuelve el método de pago aquí, se actualiza con webhook simulado
        paymentData: checkoutResponse.data, // Guardar los datos completos del mock checkout
        items: paymentItems // Los ítems preparados
      });
      await newPayment.save();
      console.log('=== BACKEND: Registro de pago creado exitosamente en DB local con MockId:', newPayment._id, '===');
    } else {
      console.error('=== BACKEND: Error al obtener ID del mock para el checkout ===');
      throw new Error('Error al crear el checkout de pago con el servicio mock.');
    }

    return successResponse(res, checkoutResponse, 'Checkout creado exitosamente');
  } catch (error) {
    console.error('=== BACKEND: Error en createOrderCheckout ===');
    console.error('Error completo:', error);
    console.error('Stack trace:', error.stack);
    
    // Cambiado: Pasar el mensaje de error original para depuración
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

    // Si no existe en nuestra base de datos, consultamos el servicio mock
    const paymentStatusResponse = await checkPaymentStatus(id);

    if (!paymentStatusResponse.success) {
      return errorResponse(res, 'Error al obtener el estado del pago', 500);
    }

    return successResponse(res, paymentStatusResponse.data, 'Estado del pago obtenido exitosamente');
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
    console.log('=== WEBHOOK RECIBIDO: req.body completo ===', JSON.stringify(req.body, null, 2));
    const webhookData = req.body;

    // Procesar el webhook
    const paymentInfo = processWebhook(webhookData);
    
    // Verificar si ya existe este pago en nuestra base de datos por su mobbexId
    // O buscarlo por la referencia (nuestro ID de pago) si es un nuevo webhook para un pago que ya iniciamos
    let payment = await Payment.findOne({
      $or: [
        { mobbexId: paymentInfo.id },
        { reference: paymentInfo.reference } // Buscar por nuestra referencia de pago
      ]
    });
    
    if (payment) {
      // Verificar que el pago tenga un usuario válido asociado
      if (!payment.user) {
        console.warn('=== BACKEND: Webhook recibido para un pago sin usuario asociado. Ignorando webhook. PaymentId:', payment._id, '===');
        return res.status(200).json({ success: true, message: 'Webhook ignorado - pago sin usuario' });
      }

      // Actualizar el pago existente
      payment.status = paymentInfo.status;
      payment.paymentMethod = paymentInfo.paymentMethod;
      payment.paymentData = webhookData.data; // Actualizar con los datos completos del webhook
      payment.updatedAt = new Date();
      
      await payment.save();
      console.log('=== BACKEND: Pago actualizado por webhook:', payment._id, '===');
      console.log('=== BACKEND: Estado del pago en webhook:', paymentInfo.status.code, '==='); // Nuevo log

      // Si el pago es aprobado, actualizar el stock de los productos
      if (paymentInfo.status.code === '2' || paymentInfo.status.code === '200') {
        console.log('=== BACKEND: Pago aprobado. Actualizando stock de productos... ===');
        for (const item of payment.items) {
          console.log(`=== BACKEND: Item para actualizar stock - Product ID: ${item.productId}, Quantity: ${item.quantity} ===`); // Nuevo log
          await updateProductStock(item.productId, item.quantity);
        }
      } else if (paymentInfo.status.code === '3' || paymentInfo.status.code === '4' || paymentInfo.status.code === '400') {
        console.log('=== BACKEND: Pago rechazado/cancelado. No se actualiza el stock. ===');
      }

    } else {
      // Si no encontramos un pago existente (caso raro, debería existir uno creado en createOrderCheckout)
      console.warn('=== BACKEND: Webhook recibido para un pago no encontrado en la DB local (mobbexId/reference):', paymentInfo.id, paymentInfo.reference, '===');
      // Opcional: Podríamos crear un nuevo registro de pago aquí, pero es preferible que ya exista.
      // Por ahora, solo logueamos la advertencia y respondemos 200.
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

// Iniciar Dev Connect de Mobbex y obtener URL de conexión
const getMobbexConnectUrl = async (req, res) => {
  try {
    const returnUrl = req.body.returnUrl;
    if (!returnUrl) {
      return errorResponse(res, 'Falta returnUrl', 400);
    }
    const response = await axios.post('https://api.mobbex.com/p/developer/connect', {
      return_url: returnUrl
    }, {
      headers: {
        'x-api-key': mobbexConfig.apiKey,
        'Content-Type': 'application/json'
      }
    });
    if (response.data && response.data.result && response.data.data && response.data.data.url) {
      return successResponse(res, { connectUrl: response.data.data.url, connectId: response.data.data.id });
    } else {
      return errorResponse(res, 'No se pudo obtener la URL de conexión de Mobbex', 500);
    }
  } catch (err) {
    console.error('Error al obtener URL de conexión de Mobbex:', err);
    return errorResponse(res, 'Error al obtener URL de conexión de Mobbex', 500);
  }
};

// Obtener credenciales de Mobbex usando Connect_ID
const getMobbexCredentials = async (req, res) => {
  try {
    const { connectId } = req.query;
    if (!connectId) {
      return errorResponse(res, 'Falta connectId', 400);
    }
    const response = await axios.get(`https://api.mobbex.com/p/developer/connect/credentials?Connect_ID=${connectId}`, {
      headers: {
        'x-api-key': mobbexConfig.apiKey
      }
    });
    if (response.data && response.data.result && response.data.data) {
      return successResponse(res, response.data.data);
    } else {
      return errorResponse(res, 'No se pudieron obtener las credenciales de Mobbex', 500);
    }
  } catch (err) {
    console.error('Error al obtener credenciales de Mobbex:', err);
    return errorResponse(res, 'Error al obtener credenciales de Mobbex', 500);
  }
};

/**
 * Simula la finalización exitosa de un pago mock
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const completeMockPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    console.log('=== MOCK PAYMENT: Completando pago simulado ===', paymentId);

    // Buscar el pago en la base de datos
    const payment = await Payment.findOne({ mobbexId: paymentId });

    if (!payment) {
      return errorResponse(res, 'Pago no encontrado', 404);
    }

    // Simular webhook exitoso
    const webhookData = simulateSuccessfulWebhook(paymentId, payment.reference);
    
    // Procesar el webhook simulado
    const paymentInfo = processWebhook(webhookData);
    
    // Actualizar el pago
    payment.status = paymentInfo.status;
    payment.paymentMethod = paymentInfo.paymentMethod;
    payment.paymentData = { ...payment.paymentData, ...webhookData.payment };
    payment.updatedAt = new Date();
    
    await payment.save();
    console.log('=== MOCK PAYMENT: Pago actualizado exitosamente ===', payment._id);

    // Actualizar stock de productos (simula el comportamiento del webhook real)
    if (paymentInfo.status.code === '2') {
      console.log('=== MOCK PAYMENT: Actualizando stock de productos... ===');
      for (const item of payment.items) {
        console.log(`=== MOCK PAYMENT: Actualizando stock - Product ID: ${item.productId}, Quantity: ${item.quantity} ===`);
        try {
          const stockResult = await updateProductStock(item.productId, item.quantity);
          if (!stockResult.success) {
            console.warn(`=== MOCK PAYMENT: No se pudo actualizar stock para producto ${item.productId}: ${stockResult.message} ===`);
          }
        } catch (error) {
          console.error(`=== MOCK PAYMENT: Error al actualizar stock para producto ${item.productId}:`, error);
          // Continuar con el siguiente producto en lugar de fallar completamente
        }
      }
    }

    return successResponse(res, {
      payment: payment,
      message: 'Pago mock completado exitosamente'
    }, 'Pago procesado exitosamente');

  } catch (error) {
    console.error('Error al completar pago mock:', error);
    return errorResponse(res, 'Error al procesar el pago mock', 500, error.message);
  }
};

module.exports = {
  createOrderCheckout,
  getPaymentStatus,
  handleWebhook,
  getUserPayments,
  getMobbexConnectUrl,
  getMobbexCredentials,
  completeMockPayment
};
