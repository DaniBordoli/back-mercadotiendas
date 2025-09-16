/**
 * Servicio de pago simulado para reemplazar Mobbex durante el desarrollo
 * Este servicio simula las respuestas de Mobbex para permitir pruebas sin integración real
 */

/**
 * Simula la creación de un checkout
 * @param {Object} orderData - Datos del pedido
 * @param {Object} customerData - Datos del cliente
 * @param {Array} items - Items del pedido
 * @param {Object} credentials - Credenciales de la tienda (no usadas en mock)
 * @returns {Object} Respuesta simulada del checkout
 */
const createMockCheckout = async (orderData, customerData, items, credentials) => {
  console.log('=== MOCK PAYMENT: Creando checkout simulado ===');
  console.log('Order Data:', JSON.stringify(orderData, null, 2));
  console.log('Customer Data:', JSON.stringify(customerData, null, 2));
  console.log('Items:', JSON.stringify(items, null, 2));

  // Simular un pequeño delay como si fuera una llamada real a la API
  await new Promise(resolve => setTimeout(resolve, 500));

  // Generar un ID único para el pago simulado
  const mockPaymentId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Simular una URL de checkout (en un caso real sería la URL de Mobbex)
  const mockCheckoutUrl = `http://localhost:3000/mock-payment/${mockPaymentId}`;

  // Respuesta simulada que imita la estructura de Mobbex
  const mockResponse = {
    success: true,
    data: {
      id: mockPaymentId,
      url: mockCheckoutUrl,
      reference: orderData.reference,
      total: orderData.total,
      currency: orderData.currency || 'ARS',
      status: {
        code: '1',
        text: 'Mock Checkout Creado'
      },
      created: new Date().toISOString(),
      // Datos adicionales que podrían ser útiles
      customer: {
        email: customerData.email,
        name: customerData.name || 'Cliente Mock'
      },
      items: items.map(item => ({
        id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price
      }))
    }
  };

  console.log('=== MOCK PAYMENT: Checkout simulado creado ===');
  console.log('Mock Response:', JSON.stringify(mockResponse, null, 2));

  return mockResponse;
};

/**
 * Simula la verificación del estado de un pago
 * @param {string} paymentId - ID del pago a verificar
 * @returns {Object} Estado simulado del pago
 */
const checkMockPaymentStatus = async (paymentId) => {
  console.log('=== MOCK PAYMENT: Verificando estado del pago ===', paymentId);

  // Simular delay
  await new Promise(resolve => setTimeout(resolve, 300));

  // Para el mock, vamos a simular que todos los pagos son exitosos
  // En un escenario real, podrías tener diferentes estados basados en el ID
  const mockStatus = {
    id: paymentId,
    status: {
      code: '2', // Código 2 = Aprobado en Mobbex
      text: 'Mock Payment Approved'
    },
    paymentMethod: {
      type: 'mock_card',
      name: 'Tarjeta de Prueba Mock'
    },
    amount: 0, // Se actualizará con el monto real desde la DB
    currency: 'ARS',
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  console.log('=== MOCK PAYMENT: Estado simulado ===', JSON.stringify(mockStatus, null, 2));

  return {
    success: true,
    data: mockStatus
  };
};

/**
 * Simula el procesamiento de un webhook
 * @param {Object} webhookData - Datos del webhook simulado
 * @returns {Object} Información procesada del pago
 */
const processMockWebhook = (webhookData) => {
  console.log('=== MOCK PAYMENT: Procesando webhook simulado ===');
  console.log('Webhook Data:', JSON.stringify(webhookData, null, 2));

  // Extraer información del webhook simulado
  const paymentInfo = {
    id: webhookData.payment?.id || webhookData.id,
    reference: webhookData.payment?.reference || webhookData.reference,
    status: {
      code: webhookData.payment?.status?.code || '2', // Por defecto aprobado
      text: webhookData.payment?.status?.text || 'Mock Payment Approved'
    },
    paymentMethod: {
      type: webhookData.payment?.paymentMethod?.type || 'mock_card',
      name: webhookData.payment?.paymentMethod?.name || 'Tarjeta de Prueba Mock'
    }
  };

  console.log('=== MOCK PAYMENT: Información procesada del webhook ===', JSON.stringify(paymentInfo, null, 2));

  return paymentInfo;
};

/**
 * Simula un webhook exitoso para un pago específico
 * Esta función puede ser llamada para simular que un pago fue procesado exitosamente
 * @param {string} paymentId - ID del pago
 * @param {string} reference - Referencia del pedido
 * @returns {Object} Datos del webhook simulado
 */
const simulateSuccessfulWebhook = (paymentId, reference) => {
  return {
    type: 'payment',
    payment: {
      id: paymentId,
      reference: reference,
      status: {
        code: '2',
        text: 'Mock Payment Approved'
      },
      paymentMethod: {
        type: 'mock_card',
        name: 'Tarjeta de Prueba Mock'
      },
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    }
  };
};

module.exports = {
  createCheckout: createMockCheckout,
  checkPaymentStatus: checkMockPaymentStatus,
  processWebhook: processMockWebhook,
  simulateSuccessfulWebhook
};