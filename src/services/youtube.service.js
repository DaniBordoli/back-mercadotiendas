const { google } = require('googleapis');
const User = require('../models/User');

// Credenciales de cliente OAuth (ya definidas en las variables de entorno)
const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const REDIRECT_URI = process.env.YT_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn('[YouTubeService] Faltan variables de entorno YT_CLIENT_ID, YT_CLIENT_SECRET o YT_REDIRECT_URI');
}

/**
 * Devuelve una nueva instancia de OAuth2Client
 */
function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Obtiene un cliente OAuth2 con credenciales válidas para el usuario indicado.
 *  - Si el access_token está expirado, utiliza el refresh_token para renovarlo.
 *  - Actualiza en BD el nuevo token (incluyendo nueva fecha de expiración) cuando se renueva.
 *
 * @param {string} userId ID de usuario de MongoDB
 * @returns {Promise<OAuth2Client>} Cliente OAuth2 listo para hacer peticiones a la API de YouTube
 */
async function getAuthorizedClient(userId) {
  const user = await User.findById(userId).select('youtubeTokens');
  if (!user || !user.youtubeTokens || !user.youtubeTokens.refresh_token) {
    throw new Error('El usuario no dispone de tokens de YouTube o falta refresh_token');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(user.youtubeTokens);

  // Comprobar expiración; Google suele devolver expiry_date en milisegundos
  const { expiry_date, access_token } = user.youtubeTokens;
  const isExpired = !access_token || (expiry_date && Date.now() >= expiry_date - 60000); // 60s de margen

  if (isExpired) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      // Persistir nuevos tokens en BD
      await User.updateOne({ _id: userId }, { youtubeTokens: credentials });
    } catch (err) {
      console.error('[YouTubeService] Error refrescando access_token', err.response?.data || err.message);
      throw err;
    }
  }

  return oauth2Client;
}

/**
 * Devuelve información de la emisión en vivo (o próxima) del usuario, si existe.
 * Busca el broadcast con status live/test/ready y devuelve id, título y miniatura.
 * @param {string} userId ID de usuario
 * @returns {Promise<{broadcastId:string,title:string,status:string,previewUrl:string}|null>}
 */
async function getLivePreview(userId) {
  const authClient = await getAuthorizedClient(userId);
  const youtube = google.youtube({ version: 'v3', auth: authClient });

  // Buscar broadcasts propios
  const { data } = await youtube.liveBroadcasts.list({
    part: ['snippet', 'status', 'contentDetails'],
    broadcastType: 'all',
    mine: true,
    maxResults: 10
  });

  if (!data.items || data.items.length === 0) return null;

  // Filtrar estado prioritario
  const candidate = data.items.find(b => ['testing', 'live', 'ready'].includes(b.status?.lifeCycleStatus));
  if (!candidate) return null;

  const broadcastId = candidate.id;
  const title = candidate.snippet?.title;
  const status = candidate.status?.lifeCycleStatus;
  // Miniatura estándar
  const previewUrl = candidate.snippet?.thumbnails?.high?.url || candidate.snippet?.thumbnails?.medium?.url || candidate.snippet?.thumbnails?.default?.url;

  return { broadcastId, title, status, previewUrl };
}

module.exports = {
  getOAuth2Client,
  getAuthorizedClient,
  getLivePreview
};