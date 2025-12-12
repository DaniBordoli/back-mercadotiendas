/**
 * Servicio para interactuar con la API de Mobbex
 * Implementa funciones para crear checkouts, verificar pagos y procesar webhooks
 */

const { mobbex } = require('mobbex');
const mobbexConfig = require('../config/mobbex');
const crypto = require('crypto');
const axios = require('axios');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const classifyMobbexError = (error) => {
  const status = error?.response?.status;
  const code = error?.code;
  const message = String(error?.message || '');
  if (message.includes('timeout') || code === 'ETIMEDOUT') return 'timeout';
  if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EAI_AGAIN') return 'network';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status >= 400) return 'validation';
  if (message.includes('Must set Api Key') || message.includes('Expecting two arguments')) return 'validation';
  return 'unknown';
};

const shouldRetry = (error) => {
  const type = classifyMobbexError(error);
  return type === 'timeout' || type === 'network' || type === 'server' || type === 'rate_limit';
};

const withRetry = async (operationFn, { retries = 2, baseDelayMs = 300, timeoutMs = 8000 } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const opPromise = operationFn();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs));
      const result = await Promise.race([opPromise, timeoutPromise]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < retries && shouldRetry(err)) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        await delay(wait);
        continue;
      }
      const type = classifyMobbexError(err);
      const wrapped = new Error(`Error (${type}) al llamar a Mobbex: ${err.message}`);
      wrapped.type = type;
      wrapped.original = err;
      throw wrapped;
    }
  }
  throw lastError;
};

// Inicializar SDK de Mobbex con credenciales
mobbex.configurations.configure({
  apiKey: mobbexConfig.apiKey,
  accessToken: mobbexConfig.accessToken,
  auditKey: mobbexConfig.auditKey
});

const isPublicUrl = (urlStr) => {
  try {
    const u = new URL(urlStr);
    const host = (u.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    return isHttp && !isLocalHost;
  } catch {
    return false;
  }
};

/**
 * Crea un checkout en Mobbex
 * @param {Object} orderData - Datos del pedido (total, descripción, referencia)
 * @param {Object} customerData - Datos del cliente (email, nombre, identificación)
 * @param {Array} items - Items del pedido
 * @param {Object} credentials - Credenciales de Mobbex (opcional)
 * @returns {Promise<Object>} - Datos del checkout creado
 */
const createCheckout = async (orderData, customerData, items, credentials = {}, options = {}) => {
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

    const frontendBase = process.env.FRONTEND_URL || mobbexConfig.returnUrl || 'http://localhost:3000';
    const backendBase = process.env.BACKEND_URL || '';
    const computedReturnUrl = `${String(frontendBase).replace(/\/+$/, '')}/mobbex-return-bridge.html`;
    const computedWebhookUrl = (process.env.NODE_ENV === 'production' && isPublicUrl(backendBase))
      ? `${String(backendBase).replace(/\/+$/, '')}/api/payments/webhook`
      : undefined;

    if (process.env.NODE_ENV === 'production' && !isPublicUrl(frontendBase)) {
      console.warn('MOBBEX SERVICE: FRONTEND_URL no es público en producción, return_url puede fallar:', frontendBase);
    }
    if (process.env.NODE_ENV === 'production' && computedWebhookUrl === undefined) {
      console.warn('MOBBEX SERVICE: BACKEND_URL no es público en producción, webhook no será enviado');
    }

    const checkoutData = {
      total: orderData.total,
      currency: 'ARS',
      description: orderData.description,
      reference: orderData.reference,
      test: process.env.NODE_ENV !== 'production',
      return_url: computedReturnUrl,
      ...(computedWebhookUrl ? { webhook: computedWebhookUrl } : {}),
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
    const payload = options && Array.isArray(options.split) && options.split.length > 0
      ? { ...checkoutData, split: options.split }
      : checkoutData;
    const response = await withRetry(
      () => (options && Array.isArray(options.split) && options.split.length > 0
        ? mobbex.checkout.split(payload)
        : mobbex.checkout.create(payload)
      ),
      { retries: 2, baseDelayMs: 400, timeoutMs: 8000 }
    );
    
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

    const searchResult = await withRetry(() => mobbex.transactions.search({ text: id, limit: 1 }, 'get'), { retries: 2, baseDelayMs: 300, timeoutMs: 5000 });

    const operation = Array.isArray(searchResult)
      ? searchResult[0]
      : (searchResult?.operations?.[0] || searchResult?.data?.operations?.[0] || searchResult?.data?.[0] || searchResult);

    if (!operation) {
      return {
        id,
        status: { code: '404', text: 'Operación no encontrada' },
        paymentMethod: null,
        amount: 0,
        currency: 'ARS',
        createdAt: new Date().toISOString(),
        reference: null,
      };
    }

    const child = Array.isArray(operation.childs) && operation.childs.length
      ? (operation.childs.find(c => String(c.operation || '').includes('payment')) || operation.childs[operation.childs.length - 1])
      : null;

    const src = child || operation;

    const paymentInfo = {
      id: String(src.id || operation.id || id),
      status: {
        code: String((src.status && src.status.code) || src.status || '200'),
        text: String((src.status && src.status.text) || 'Estado consultado')
      },
      paymentMethod: (src.payment_method && src.payment_method.name) || (src.source && src.source.name) || null,
      amount: Number(src.total || src.amount || 0),
      currency: String(src.currency || operation.currency || 'ARS'),
      createdAt: String(src.created || src.updated || new Date().toISOString()),
      reference: String(src.reference || operation.reference || '')
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

    if (mobbexConfig.auditKey && (webhookData.signature || (webhookData.headers && webhookData.headers['x-signature']))) {
      const signature = webhookData.signature || (webhookData.headers ? webhookData.headers['x-signature'] : null);
      const payload = webhookData.raw || JSON.stringify(webhookData);
      const expected = crypto.createHmac('sha256', mobbexConfig.auditKey).update(payload).digest('hex');
      if (signature !== expected) {
        throw new Error('Firma de webhook inválida');
      }
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
