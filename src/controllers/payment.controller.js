// Comentamos Mobbex y usamos el servicio mock
// const { createCheckout, checkPaymentStatus, processWebhook } = require('../services/mobbex.service');
const { createCheckout, checkPaymentStatus, processWebhook, simulateSuccessfulWebhook } = require('../services/mock-payment.service');
const { successResponse, errorResponse } = require('../utils/response');
const Payment = require('../models/Payment');
const Shop = require('../models/Shop');
const { updateProductStock } = require('./product.controller'); // Importar la función de stock
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const ProductModel = require('../models/Products');
const axios = require('axios');
// const mobbexConfig = require('../config/mobbex'); // No necesario para mock
const LiveEventMetrics = require('../models/LiveEventMetrics');
const LiveEventProductMetrics = require('../models/LiveEventProductMetrics');

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

    // Obtener información de los productos y sus tiendas
    const productIds = items.map((item) => item.productId);
    const products = await require('../models/Products').find({ _id: { $in: productIds } }).populate('shop', 'name owner mobbexApiKey mobbexAccessToken');

    if (!products || products.length === 0) {
      return errorResponse(res, 'No se encontraron los productos especificados', 400);
    }

    // Mapear productos para acceso rápido
    const productMap = new Map();
    products.forEach((product) => {
      productMap.set(product._id.toString(), product);
    });

    // Preparar ítems, asignando shopName desde la tienda del producto
    const paymentItems = items.map((item) => {
      const prod = productMap.get(item.productId);
      const shopName = prod && prod.shop ? prod.shop.name : 'Tienda no especificada';
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
        productName: item.name,
        productImage: item.image,
        shopName,
      };
    });

    // Seleccionar la tienda del primer producto para credenciales de pago (asumiendo un único owner)
    const checkoutShop = products[0].shop;
    if (!checkoutShop) {
      return errorResponse(res, 'No se encontró la tienda asociada a los productos', 400);
    }

    // Generar una referencia única para el pedido que se enviará a Mobbex
    orderData.reference = `order_${Date.now()}`;

    // Crear checkout usando el servicio mock (reemplaza Mobbex temporalmente)
    console.log('=== BACKEND: Ítems enviados al servicio mock desde controller ===', JSON.stringify(items, null, 2));
    console.log('=== BACKEND: Llamando al servicio de pago mock ===');
    const checkoutResponse = await createCheckout(orderData, customerData, items, {
      mobbexApiKey: checkoutShop.mobbexApiKey || 'mock_api_key',
      mobbexAccessToken: checkoutShop.mobbexAccessToken || 'mock_access_token',
    });

    console.log('=== BACKEND: Respuesta del servicio mock ===');
    console.log('checkoutResponse:', JSON.stringify(checkoutResponse, null, 2));

    // Si el checkout mock fue exitoso, crear y guardar el registro de pago en nuestra DB
    if (checkoutResponse.success && checkoutResponse.data.id) {
      const { liveEventId } = req.body;
      const newPayment = new Payment({
        user: userId,
        mobbexId: checkoutResponse.data.id,
        reference: orderData.reference,
        amount: orderData.total,
        currency: orderData.currency || 'ARS',
        status: { code: '1', text: 'Mock Checkout Creado' },
        paymentMethod: null,
        paymentData: checkoutResponse.data,
        items: paymentItems,
        ...(liveEventId ? { liveEvent: liveEventId } : {})
      });
      await newPayment.save();
      console.log('=== BACKEND: Registro de pago creado exitosamente en DB local con MockId:', newPayment._id, '===');

      // Emitir notificación al vendedor/es sobre la nueva orden
      try {
        const io = req.app.get('io');
        // Notificar a todos los dueños involucrados en la orden
        const ownerIds = Array.from(new Set(
          products
            .map(p => (p?.shop?.owner ? p.shop.owner.toString() : ''))
            .filter(Boolean)
        ));
        for (const ownerId of ownerIds) {
          await emitNotification(io, ownerId, {
            type: 'order',
            title: 'Nueva orden recibida',
            message: `Se ha creado la orden ${orderData.reference}`,
            entity: 'order',
            data: { paymentId: newPayment._id, reference: orderData.reference },
          });
        }
        // Notificar también al comprador si está autenticado
        if (io && userId) {
          await emitNotification(io, userId, {
            type: 'order',
            title: 'Orden creada',
            message: `Tu orden ${orderData.reference} ha sido creada exitosamente`,
            entity: 'order',
            data: { paymentId: newPayment._id, reference: orderData.reference },
          });
        }
      } catch (notifyErr) {
        console.error('Error al emitir notificación de nueva orden:', notifyErr);
      }
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
      if ((paymentInfo.status.code === '2' || paymentInfo.status.code === '200') && payment.liveEvent) {
        // Incrementar compras y monto de ventas
        LiveEventMetrics.updateOne(
          { event: payment.liveEvent },
          {
            $inc: {
              purchases: 1,
              salesAmount: payment.amount || 0
            }
          },
          { upsert: true }
        ).catch(console.error);

        // Actualizar métricas por producto (purchases y revenue)
        try {
          for (const item of payment.items) {
            const quantity = item.quantity || 1;
            const unitPrice = item.unitPrice || item.price || 0;
            await LiveEventProductMetrics.updateOne(
              { event: payment.liveEvent, product: item.productId },
              {
                $inc: {
                  purchases: quantity,
                  revenue: unitPrice * quantity,
                },
              },
              { upsert: true }
            );
          }

          // Emitir actualización de métricas por Socket.IO
          const io = req.app.get('io');
          if (io) {
            const productMetrics = await LiveEventProductMetrics.find({ event: payment.liveEvent }).populate('product', 'nombre precio productImages');
            io.to(`event_${payment.liveEvent}`).emit('productMetricsUpdated', {
              eventId: payment.liveEvent,
              metrics: productMetrics,
            });
          }
        } catch (e) {
          console.warn('No se pudieron actualizar/emitar métricas de productos', e.message);
        }
      }
      if (paymentInfo.status.code === '2' || paymentInfo.status.code === '200') {
        console.log('=== BACKEND: Pago aprobado. Actualizando stock de productos... ===');
        for (const item of payment.items) {
          console.log(`=== BACKEND: Item para actualizar stock - Product ID: ${item.productId}, Quantity: ${item.quantity} ===`); // Nuevo log
          await updateProductStock(item.productId, item.quantity);
        }
        // Emitir notificaciones de pago aprobado
        try {
          const io = req.app.get('io');
          if (io) {
            // Notificar al comprador
            await NotificationService.emitAndPersist(io, {
              users: [payment.user],
              type: NotificationTypes.PAYMENT,
              title: 'Pago aprobado',
              message: `Tu pago para la orden ${payment.reference} ha sido acreditado exitosamente`,
              entity: payment._id,
              data: {
                reference: payment.reference,
                amount: payment.amount,
                items: (payment.items || []).map(i => ({
                  productName: i.productName,
                  quantity: i.quantity,
                  shopName: i.shopName
                }))
              },
            });
            // Notificar a todos los vendedores involucrados (no solo el primer producto)
            const productIdsInPayment = (payment.items || []).map(i => i.productId).filter(Boolean);
            const prods = await ProductModel.find({ _id: { $in: productIdsInPayment } }).populate('shop', 'owner');
            const sellerIds = Array.from(new Set(
              prods.map(p => (p?.shop?.owner ? p.shop.owner.toString() : '')).filter(Boolean)
            ));
            if (sellerIds.length) {
              await NotificationService.emitAndPersist(io, {
                users: sellerIds,
                type: NotificationTypes.PAYMENT,
                title: 'Pago recibido',
                message: `Has recibido un pago por la orden ${payment.reference}`,
                entity: payment._id,
                data: {
                  reference: payment.reference,
                  amount: payment.amount,
                  items: (payment.items || []).map(i => ({
                    productName: i.productName,
                    quantity: i.quantity,
                    shopName: i.shopName
                  }))
                },
              });
            }
          }
        } catch (notifErr) {
          console.error('Error al emitir notificación de pago aprobado:', notifErr);
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
      .populate('user', 'name email')
      .lean();
    
    return successResponse(res, payments, 'Historial de pagos obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el historial de pagos', 500, error.message);
  }
};

/**
 * Obtiene el historial de pagos que corresponden a productos de la tienda del usuario autenticado (vendedor)
 * @param {Object} req - Request
 * @param {Object} res - Response
 */
const getSellerPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    // Buscar la tienda del usuario
    const shop = await Shop.findOne({ owner: userId }).lean();
    if (!shop) {
      return successResponse(res, [], 'El usuario no tiene tienda');
    }
    // Obtener los productos de la tienda
    const productIds = (await ProductModel.find({ shop: shop._id }).select('_id').lean()).map(p => p._id);
    if (!productIds.length) {
      return successResponse(res, [], 'La tienda no tiene productos');
    }
    // Buscar pagos que incluyan items de estos productos
    const payments = await Payment.find({ 'items.productId': { $in: productIds } })
      .sort({ createdAt: -1 })
      .populate('user', 'name email')
      .lean();
    return successResponse(res, payments, 'Historial de pagos del vendedor obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el historial de pagos del vendedor', 500, error.message);
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

    // Emitir notificaciones similares al webhook cuando el pago fue aprobado
    try {
      if (paymentInfo.status.code === '2') {
        const io = req.app.get('io');
        if (io) {
          // Notificar al comprador
          await NotificationService.emitAndPersist(io, {
            users: [payment.user],
            type: NotificationTypes.PAYMENT,
            title: 'Pago aprobado',
            message: `Tu pago para la orden ${payment.reference} ha sido acreditado exitosamente`,
            entity: payment._id,
            data: {
              reference: payment.reference,
              amount: payment.amount,
              items: (payment.items || []).map(i => ({
                productName: i.productName,
                quantity: i.quantity,
                shopName: i.shopName
              }))
            },
          });
          // Notificar a todos los vendedores involucrados
          const productIdsInPayment = (payment.items || []).map(i => i.productId).filter(Boolean);
          const prods = await ProductModel.find({ _id: { $in: productIdsInPayment } }).populate('shop', 'owner');
          const sellerIds = Array.from(new Set(
            prods.map(p => (p?.shop?.owner ? p.shop.owner.toString() : '')).filter(Boolean)
          ));
          if (sellerIds.length) {
            await NotificationService.emitAndPersist(io, {
              users: sellerIds,
              type: NotificationTypes.PAYMENT,
              title: 'Pago recibido',
              message: `Has recibido un pago por la orden ${payment.reference}`,
              entity: payment._id,
              data: {
                reference: payment.reference,
                amount: payment.amount,
                items: (payment.items || []).map(i => ({
                  productName: i.productName,
                  quantity: i.quantity,
                  shopName: i.shopName
                }))
              },
            });
          }
        }
      }
    } catch (e) {
      console.error('Error al emitir notificaciones en pago mock:', e);
    }

    return successResponse(res, {
      payment: payment,
      message: 'Pago mock completado exitosamente'
    }, 'Pago procesado exitosamente');

    // Emitir métricas actualizadas por Socket.IO si corresponde
    try {
      if (payment.liveEvent) {
        const io = req.app.get('io');
        if (io) {
          const productMetrics = await LiveEventProductMetrics.find({ event: payment.liveEvent }).populate('product', 'nombre precio productImages');
          io.to(`event_${payment.liveEvent}`).emit('productMetricsUpdated', {
            eventId: payment.liveEvent,
            metrics: productMetrics,
          });
        }
      }
    } catch (e) {
      console.warn('No se pudo emitir productMetricsUpdated después de pago mock', e.message);
    }
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
  getSellerPayments,
  getMobbexConnectUrl,
  getMobbexCredentials,
  completeMockPayment
};
