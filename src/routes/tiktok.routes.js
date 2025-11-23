const router = require('express').Router();
const axios = require('axios');
const querystring = require('querystring');
const crypto = require('crypto');

// Entorno
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;
const SCOPES = [
  'user.info.basic',
  'user.info.profile',
  // Agrega otros permisos que tu app necesite
].join(',');

/**
 * @route GET /api/auth/tiktok
 * @desc Redirige al usuario al login de TikTok Login Kit
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    if (!CLIENT_KEY || !REDIRECT_URI) {
      return res.status(500).json({ success: false, message: 'TikTok credentials not configured' });
    }

    const state = Math.random().toString(36).substring(2, 15); // estado simple; idealmente almacenar en sesión

    // PKCE: generar code_verifier y challenge
    const codeVerifier = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    // almacenar para uso en callback (idealmente BD/redis)
    stateStore.set(state, codeVerifier);

    const params = querystring.stringify({
      client_key: CLIENT_KEY,
      scope: SCOPES,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://www.tiktok.com/v2/auth/authorize?${params}`;
    return res.redirect(authUrl);
  } catch (err) {
    console.error('TikTok auth redirect error:', err);
    res.status(500).json({ success: false, message: 'Error iniciando autenticación con TikTok' });
  }
});

/**
 * @route GET /api/auth/tiktok/callback
 * @desc Recibe code de TikTok y obtiene access_token
 * @access Public
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Code no proporcionado' });
  }

  try {
    // inside callback token request add code_verifier
    const codeVerifier = stateStore.get(state);
    if (!codeVerifier) {
      return res.status(400).json({ success: false, message: 'code_verifier no encontrado para el estado proporcionado' });
    }

    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token', {
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    });

    // limpiar state
    stateStore.delete(state);

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      open_id: openId,
      scope
    } = tokenResponse.data.data || {};

    // Aquí podrías guardar tokens en la BD y asociarlos a tu usuario autenticado
    // Por simplicidad, los retornamos directamente

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn,
        openId,
        scope
      }
    });
  } catch (err) {
    console.error('TikTok token exchange error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error intercambiando token con TikTok' });
  }
});

module.exports = router;

// En memoria temporal para mapear state -> code_verifier
const stateStore = new Map();

function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}