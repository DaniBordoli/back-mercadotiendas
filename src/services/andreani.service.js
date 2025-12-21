const axios = require('axios');

let cachedToken = null;
let tokenExpiresAt = 0;

const getAndreaniBaseUrl = () => {
  return process.env.ANDREANI_BASE_URL || 'https://apisandbox.andreani.com';
};

const getAuthHeaders = async () => {
  const now = Date.now();

  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt - 60 * 1000) {
    return {
      Authorization: `Bearer ${cachedToken}`,
      'Content-Type': 'application/json',
    };
  }

  const clientId = process.env.ANDREANI_CLIENT_ID;
  const clientSecret = process.env.ANDREANI_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Faltan ANDREANI_CLIENT_ID o ANDREANI_CLIENT_SECRET en variables de entorno');
  }

  const url = `${getAndreaniBaseUrl()}/auth/v1/token`;

  const authResponse = await axios.post(
    url,
    {},
    {
      auth: {
        username: clientId,
        password: clientSecret,
      },
    }
  );

  const { access_token, expires_in } = authResponse.data || {};

  if (!access_token) {
    throw new Error('Andreani no devolvió access_token');
  }

  cachedToken = access_token;
  const ttlMs = typeof expires_in === 'number' && expires_in > 0 ? expires_in * 1000 : 3300 * 1000;
  tokenExpiresAt = now + ttlMs;

  return {
    Authorization: `Bearer ${cachedToken}`,
    'Content-Type': 'application/json',
  };
};

const buildPackageDimensions = (product) => {
  const largo = Number(product?.largoCm) || 10;
  const ancho = Number(product?.anchoCm) || 10;
  const alto = Number(product?.altoCm) || 10;
  const peso = Number(product?.pesoKg) || 0.5;

  return {
    peso,
    largo,
    ancho,
    alto,
    volumen: largo * ancho * alto,
  };
};

const quoteShipment = async ({ postalCode, province, locality, products }) => {
  if (!postalCode) {
    throw new Error('El código postal de destino es obligatorio');
  }

  const headers = await getAuthHeaders();

  const dimensiones = Array.isArray(products)
    ? products.map(buildPackageDimensions)
    : [];

  const payload = {
    origen: {
      codigoPostal: process.env.ANDREANI_ORIGIN_POSTAL_CODE || '1406',
    },
    destino: {
      codigoPostal: String(postalCode),
      ...(province ? { provincia: province } : {}),
      ...(locality ? { localidad: locality } : {}),
    },
    bultos: dimensiones.length
      ? dimensiones.map((dim) => ({
          peso: dim.peso,
          altoCm: dim.alto,
          anchoCm: dim.ancho,
          largoCm: dim.largo,
          volumenCm3: dim.volumen,
        }))
      : [],
  };

  const url = `${getAndreaniBaseUrl()}/tarifas/v1/cotizar`;

  const { data } = await axios.post(url, payload, { headers });

  return data;
};

const getBranches = async ({ postalCode }) => {
  if (!postalCode) {
    throw new Error('El código postal es obligatorio');
  }

  const headers = await getAuthHeaders();
  const url = `${getAndreaniBaseUrl()}/sucursales/v1/sucursales?codigoPostal=${encodeURIComponent(
    String(postalCode)
  )}`;

  const { data } = await axios.get(url, { headers });

  return data;
};

module.exports = {
  getAuthHeaders,
  quoteShipment,
  getBranches,
  buildPackageDimensions,
};

