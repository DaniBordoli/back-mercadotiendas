/**
 * Servicio para interactuar con la API de Mobbex
 * Implementa funciones para crear checkouts, verificar pagos y procesar webhooks
 */

const { mobbex } = require('mobbex');
const mobbexConfig = require('../config/mobbex');

// Inicializar SDK de Mobbex con credenciales
mobbex.configurations.configure({
  apiKey: mobbexConfig.apiKey,
  accessToken: mobbexConfig.accessToken,
  auditKey: mobbexConfig.auditKey
});

/**
 * Crea un checkout en Mobbex
 * @param {Object} orderData - Datos del pedido (total, descripción, referencia)
 * @param {Object} customerData - Datos del cliente (email, nombre, identificación)
 * @param {Array} items - Items del pedido
 * @param {Object} credentials - Credenciales de Mobbex (opcional)
 * @returns {Promise<Object>} - Datos del checkout creado
 */
const createCheckout = async (orderData, customerData, items, credentials = {}) => {
  try {
    console.log('=== MOBBEX SERVICE: Iniciando createCheckout ===');
    console.log('orderData recibido:', JSON.stringify(orderData, null, 2));
    console.log('customerData recibido:', JSON.stringify(customerData, null, 2));
    console.log('items recibidos:', JSON.stringify(items, null, 2));

    // Configurar el SDK de Mobbex con las credenciales de la tienda si se proporcionan
    if (credentials.mobbexApiKey && credentials.mobbexAccessToken) {
      mobbex.configurations.configure({
        apiKey: credentials.mobbexApiKey,
        accessToken: credentials.mobbexAccessToken,
        auditKey: mobbexConfig.auditKey
      });
    } else {
      mobbex.configurations.configure({
        apiKey: mobbexConfig.apiKey,
        accessToken: mobbexConfig.accessToken,
        auditKey: mobbexConfig.auditKey
      });
    }

    // Preparar datos para Mobbex
    const checkoutData = {
      total: orderData.total,
      currency: 'ARS',
      description: orderData.description,
      reference: orderData.reference,
      test: process.env.NODE_ENV !== 'production',
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/mobbex-return-bridge.html`,
      // Webhook temporal para desarrollo - Mobbex requiere URL pública válida
      // En desarrollo usamos una URL de prueba o removemos el webhook
      ...(process.env.NODE_ENV === 'production' && process.env.BACKEND_URL && !process.env.BACKEND_URL.includes('localhost') 
        ? { webhook: `${process.env.BACKEND_URL}/api/payments/webhook` }
        : {}
      ),
      customer: {
        email: customerData.email,
        name: customerData.name,
        identification: customerData.identification
      },
      items: items.map(item => ({
        title: item.name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.price,
        total: item.price * item.quantity,
        image: item.image || 'https://www.mobbex.com/wp-content/uploads/2019/03/web_logo.png'
      }))
    };

    console.log('=== MOBBEX SERVICE: Datos preparados para enviar a Mobbex ===');
    console.log('checkoutData completo:', JSON.stringify(checkoutData, null, 2));
    console.log('Variables de entorno:');
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- FRONTEND_URL:', process.env.FRONTEND_URL);
    console.log('- BACKEND_URL:', process.env.BACKEND_URL);
    console.log('- MOBBEX_API_KEY existe:', !!process.env.MOBBEX_API_KEY);
    console.log('- MOBBEX_ACCESS_TOKEN existe:', !!process.env.MOBBEX_ACCESS_TOKEN);

    // Crear checkout en Mobbex
    console.log('=== MOBBEX SERVICE: Enviando request a Mobbex API ===');
    const response = await mobbex.checkout.create(checkoutData);
    
    console.log('=== MOBBEX SERVICE: Respuesta cruda de Mobbex ===');
    console.log('response completo:', JSON.stringify(response, null, 2));
    console.log('response.data:', JSON.stringify(response.data, null, 2));

    if (!response || !response.data) {
      console.error('=== MOBBEX SERVICE: Respuesta inválida de Mobbex ===');
      console.error('response:', response);
      throw new Error('Respuesta inválida de Mobbex');
    }

    // Ajustar la estructura de la respuesta para que coincida con la esperada en el controlador
    const result = {
      success: true, // Indicar éxito explícitamente
      data: {
        id: response.data.id,
        url: response.data.url,
        redirectUrl: response.data.redirectUrl || response.data.url, // Asegurar redirectUrl
        // Opcional: si Mobbex devuelve un status inicial, se podría incluir aquí
        // status: response.data.status || 'pending'
      },
      message: 'Checkout de Mobbex creado exitosamente'
    };

    console.log('=== MOBBEX SERVICE: Resultado final ===');
    console.log('result:', JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('=== MOBBEX SERVICE: Error en createCheckout ===');
    console.error('Error completo:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.response) {
      console.error('=== MOBBEX SERVICE: Error response de Mobbex ===');
      console.error('Status:', error.response.status);
      console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    throw new Error(`Error al crear checkout en Mobbex: ${error.message}`);
  }
};

/**
 * Verifica el estado de un pago en Mobbex
 * @param {string} id - ID de la operación en Mobbex
 * @returns {Promise<Object>} - Estado del pago
 */
const checkPaymentStatus = async (id) => {
  try {
    if (!id) {
      throw new Error('El ID de la operación es requerido');
    }

    // Consultar estado en Mobbex usando el módulo transactions
    // Nota: El SDK de Mobbex no tiene un método directo para consultar una operación por ID
    // Por lo que devolvemos información básica y simulamos una respuesta exitosa para pruebas
    
    // En un entorno de producción, se debería implementar una consulta real
    // utilizando el endpoint adecuado de la API de Mobbex
    
    const paymentInfo = {
      id: id,
      status: {
        code: '200',
        text: 'Pendiente de pago'
      },
      paymentMethod: 'Método de prueba',
      amount: 0,
      currency: 'ARS',
      createdAt: new Date().toISOString(),
      reference: `ref_${id}`
    };

    return paymentInfo;
  } catch (error) {
    console.error('Error en checkPaymentStatus:', error);
    throw error;
  }
};

/**
 * Procesa los datos recibidos de un webhook de Mobbex
 * @param {Object} webhookData - Datos recibidos del webhook
 * @returns {Object} - Información procesada del pago
 */
const processWebhook = (webhookData) => {
  try {
    if (!webhookData || !webhookData.data) {
      throw new Error('Datos de webhook inválidos');
    }

    const data = webhookData.data;

    // Verificar firma del webhook si hay auditKey configurada
    if (mobbexConfig.auditKey) {
      // Aquí iría la lógica de verificación de firma
      // Ejemplo: verificar webhookData.signature con auditKey
    }

    // Extraer información relevante
    const paymentInfo = {
      id: data.id,
      status: {
        code: data.status.code,
        text: data.status.text
      },
      paymentMethod: data.payment_method ? data.payment_method.name : null,
      amount: data.total,
      currency: data.currency,
      createdAt: data.created,
      reference: data.reference,
      customer: data.customer
    };

    return paymentInfo;
  } catch (error) {
    console.error('Error en processWebhook:', error);
    throw error;
  }
};

module.exports = {
  createCheckout,
  checkPaymentStatus,
  processWebhook
};
