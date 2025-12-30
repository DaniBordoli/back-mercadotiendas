const axios = require('axios');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const classifyMpError = (error) => {
  const status = error?.response?.status;
  const code = error?.code;
  const message = String(error?.message || '');
  if (message.includes('timeout') || code === 'ETIMEDOUT') return 'timeout';
  if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EAI_AGAIN') return 'network';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (status >= 400) return 'validation';
  return 'unknown';
};

const shouldRetry = (error) => {
  const type = classifyMpError(error);
  return type === 'timeout' || type === 'network' || type === 'server' || type === 'rate_limit';
};

const withRetry = async (operationFn, { retries = 2, baseDelayMs = 300, timeoutMs = 8000 } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const opPromise = operationFn();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs)
      );
      const result = await Promise.race([opPromise, timeoutPromise]);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < retries && shouldRetry(err)) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        await delay(wait);
        continue;
      }
      const type = classifyMpError(err);
      const wrapped = new Error(`Error (${type}) al llamar a Mercado Pago: ${err.message}`);
      wrapped.type = type;
      wrapped.original = err;
      throw wrapped;
    }
  }
  throw lastError;
};

const buildAuthHeaders = (shopCredentials) => {
  const token = (shopCredentials && shopCredentials.mpAccessToken) || process.env.MP_ACCESS_TOKEN || '';
  if (!token) {
    throw new Error('Falta access token de Mercado Pago');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

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

const createPreference = async (params, shopCredentials = {}) => {
  const {
    orderData,
    customerData,
    items,
    shippingDetails,
    backUrls,
    notificationUrl,
    externalReference
  } = params || {};

  if (!orderData || !Array.isArray(items) || !items.length) {
    throw new Error('Datos de orden inválidos para crear preferencia');
  }

  const headers = buildAuthHeaders(shopCredentials);

  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
  const backendBase = process.env.BACKEND_URL || '';

  const normalizedBackUrls = backUrls && typeof backUrls === 'object'
    ? backUrls
    : {
        success: `${String(frontendBase).replace(/\/+$/, '')}/payment/return?provider=mercadopago&status=approved`,
        failure: `${String(frontendBase).replace(/\/+$/, '')}/payment/return?provider=mercadopago&status=rejected`,
        pending: `${String(frontendBase).replace(/\/+$/, '')}/payment/return?provider=mercadopago&status=pending`
      };

  const computedNotificationUrl = notificationUrl
    ? notificationUrl
    : (process.env.NODE_ENV === 'production' && isPublicUrl(backendBase))
        ? `${String(backendBase).replace(/\/+$/, '')}/api/payments/mercadopago/webhook`
        : undefined;

  const mpItems = items.map((item) => ({
    title: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.price,
    currency_id: orderData.currency || 'ARS',
    picture_url: item.image
  }));

  const mpPreference = {
    items: mpItems,
    payer: customerData
      ? {
          email: customerData.email,
          name: customerData.name
        }
      : undefined,
    back_urls: normalizedBackUrls,
    auto_return: 'approved',
    external_reference: externalReference || orderData.reference,
    notification_url: computedNotificationUrl,
    metadata: {
      reference: orderData.reference || '',
      shipping: shippingDetails || null
    }
  };

  const url = 'https://api.mercadopago.com/checkout/preferences';

  const response = await withRetry(
    () => axios.post(url, mpPreference, { headers }),
    { retries: 2, baseDelayMs: 400, timeoutMs: 8000 }
  );

  if (!response || !response.data) {
    throw new Error('Respuesta inválida de Mercado Pago al crear preferencia');
  }

  const data = response.data;

  return {
    preferenceId: data.id,
    initPoint: data.init_point,
    sandboxInitPoint: data.sandbox_init_point,
    raw: data
  };
};

const getPaymentStatus = async (paymentId, shopCredentials = {}) => {
  if (!paymentId) {
    throw new Error('El paymentId es requerido');
  }

  const headers = buildAuthHeaders(shopCredentials);
  const url = `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`;

  const response = await withRetry(
    () => axios.get(url, { headers }),
    { retries: 2, baseDelayMs: 300, timeoutMs: 5000 }
  );

  if (!response || !response.data) {
    throw new Error('Respuesta inválida de Mercado Pago al consultar pago');
  }

  const src = response.data;

  return {
    id: String(src.id || paymentId),
    status: {
      code: String(src.status || 'unknown'),
      text: String(src.status_detail || 'Estado consultado')
    },
    paymentMethod: src.payment_method_id || null,
    amount: Number(src.transaction_amount || 0),
    currency: String(src.currency_id || 'ARS'),
    createdAt: String(src.date_created || new Date().toISOString()),
    reference: String(src.external_reference || ''),
    payerEmail: src.payer && src.payer.email ? String(src.payer.email) : null,
    raw: src
  };
};

module.exports = {
  createPreference,
  getPaymentStatus
};

