const { google } = require('googleapis');
const mongoose = require('mongoose');
const User = require('../models/User');
const InfluencerProfile = require('../models/InfluencerProfile');

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

/**
 * Refresca el conteo de suscriptores de YouTube para el usuario indicado.
 * - Usa getAuthorizedClient para asegurarse de que el access_token es válido (y lo renueva si hace falta)
 * - Obtiene la información del canal y extrae subscriberCount
 * - Actualiza user.youtubeTokens.subscribers, influencerProfile.socialMedia (platform=="youtube"),
 *   y recalcula influencerProfile.stats.totalFollowers
 *
 * Esta función está pensada para llamarse bajo demanda (por ejemplo, cuando el usuario abre su perfil
 * o cuando se listan los influencers) para mantener los datos actualizados sin requerir reconexión.
 *
 * @param {string} userId ID de usuario de MongoDB
 * @returns {Promise<number|null>} Devuelve el número de suscriptores o null si no se pudo obtener
 */
async function refreshYouTubeSubscribers(userId) {
  try {
    const authClient = await getAuthorizedClient(userId);
    const youtube = google.youtube({ version: 'v3', auth: authClient });

    const { data } = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    const subscribers = parseInt(channel.statistics.subscriberCount || '0', 10);

    // Actualizar usuario y perfil de influencer en la BD
    const user = await User.findById(userId);
    if (!user) return subscribers;

    // Guardar subs en youtubeTokens
    user.youtubeTokens = {
      ...user.youtubeTokens,
      subscribers,
    };

    // Si el usuario tiene perfil de influencer, actualizar socialMedia y totalFollowers
    if (user.influencerProfile) {
      let profileId = null;
      if (mongoose.isValidObjectId(user.influencerProfile)) {
        profileId = user.influencerProfile;
      } else if (user.influencerProfile && mongoose.isValidObjectId(user.influencerProfile._id)) {
        profileId = user.influencerProfile._id;
      }

      let influencerProfile = null;
      if (profileId) {
        influencerProfile = await InfluencerProfile.findById(profileId);
      }
       if (influencerProfile) {
         // socialMedia es un array de objetos { platform, username, followers }
        if (!Array.isArray(influencerProfile.socialMedia)) {
          influencerProfile.socialMedia = [];
        }
        // Buscar entrada de YouTube
        const ytIndex = influencerProfile.socialMedia.findIndex((sm) => sm.platform === 'youtube');
        if (ytIndex !== -1) {
          influencerProfile.socialMedia[ytIndex].followers = subscribers;
          // Si no tiene username, usar title del canal
          if (!influencerProfile.socialMedia[ytIndex].username && channel.snippet?.title) {
            influencerProfile.socialMedia[ytIndex].username = channel.snippet.title;
          }
        } else {
          influencerProfile.socialMedia.push({
            platform: 'youtube',
            username: channel.snippet?.title || 'YouTube',
            followers: subscribers,
          });
        }
        // Recalcular totalFollowers
        influencerProfile.stats = influencerProfile.stats || {};
        const total = influencerProfile.socialMedia.reduce((sum, sm) => sum + (parseInt(sm.followers || 0, 10)), 0);
        influencerProfile.stats.totalFollowers = total;

        // Marcar campos modificados para asegurar persistencia
        influencerProfile.markModified('socialMedia');
        influencerProfile.markModified('stats');

        await influencerProfile.save();
      }
    }

    // Si el usuario tiene influencerProfile embebido en el documento User, también actualizarlo
    if (user.influencerProfile) {
      // Asegurar que socialMedia sea un array válido
      if (!Array.isArray(user.influencerProfile.socialMedia)) {
        user.influencerProfile.socialMedia = [];
      }
      const socialMediaEmb = user.influencerProfile.socialMedia;
      const ytIndexEmb = socialMediaEmb.findIndex((sm)=> sm.platform === 'youtube');
      if (ytIndexEmb !== -1) {
        socialMediaEmb[ytIndexEmb].followers = subscribers;
        if (!socialMediaEmb[ytIndexEmb].username && channel.snippet?.title) {
          socialMediaEmb[ytIndexEmb].username = channel.snippet.title;
        }
      } else {
        socialMediaEmb.push({
          platform: 'youtube',
          username: channel.snippet?.title || 'YouTube',
          followers: subscribers,
        });
      }
      // Recalcular totalFollowers basados en el array actualizado
      user.influencerProfile.stats = user.influencerProfile.stats || {};
      user.influencerProfile.stats.totalFollowers = socialMediaEmb.reduce((sum, sm)=> sum + (parseInt(sm.followers || 0,10)), 0);
      // Marcar campos modificados para asegurar que Mongoose persista los cambios anidados
      user.markModified('influencerProfile');
    }

    await user.save();

    return subscribers;
  } catch (error) {
    console.error('[YouTubeService] refreshYouTubeSubscribers error:', error?.message || error);
    return null;
  }
}

module.exports = {
  getOAuth2Client,
  getAuthorizedClient,
  getLivePreview,
  refreshYouTubeSubscribers,
};