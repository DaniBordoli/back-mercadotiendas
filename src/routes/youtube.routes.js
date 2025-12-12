const router = require('express').Router();
const { google } = require('googleapis');
const axios = require('axios');
const User = require('../models/User');
const gatewaySessions = new Map();

// Credentials from env
const CLIENT_ID = process.env.YT_CLIENT_ID;
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET;
const REDIRECT_URI = process.env.YT_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn('[YouTubeAuth] Falta configurar YT_CLIENT_ID, YT_CLIENT_SECRET o YT_REDIRECT_URI en las variables de entorno');
}

// OAuth2 client instance
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes requeridos
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube' // para crear live broadcasts, etc.
];

/**
 * @route GET /api/auth/youtube
 * @desc Redirige al usuario al consentimiento OAuth de Google/YouTube
 */
const { verifyToken } = require('../middlewares/auth');

// Inicia flujo OAuth o devuelve la URL (para peticiones XHR)
router.get('/', verifyToken, (req, res) => {
  try {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
    const state = JSON.stringify({ userId: req.user.id, returnTo });
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state
    });

    // Si la petición viene de XHR (header Accept contiene application/json o query json=true), devolvemos JSON
    if (req.headers.accept?.includes('application/json') || req.query.json === 'true' || req.xhr) {
      return res.json({ success: true, url });
    }

    return res.redirect(url);
  } catch (err) {
    console.error('[YouTubeAuth] Error generando URL de consentimiento', err);
    return res.status(500).json({ success: false, message: 'Error iniciando autenticación con YouTube' });
  }
});

/**
 * @route GET /api/auth/youtube/callback
 * @desc Recibe el code y canjea por tokens, luego redirige al front
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ success: false, message: 'Code faltante' });

  try {
    const { tokens } = await oauth2Client.getToken(code);

    let userId = req.query.state;
    let returnTo = null;
    try {
      const parsed = typeof req.query.state === 'string' ? JSON.parse(req.query.state) : null;
      if (parsed && typeof parsed === 'object') {
        userId = parsed.userId;
        returnTo = parsed.returnTo;
      }
    } catch {}

    if (userId) {
      await User.updateOne({ _id: userId }, { youtubeTokens: tokens });
    }

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
    const safePath = typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/social-connection?youtube=connected';
    return res.redirect(`${frontendBase}${safePath}`);
  } catch (err) {
    console.error('[YouTubeAuth] Error intercambiando token', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error intercambiando token con YouTube' });
  }
});

/**
 * @route POST /api/auth/youtube/chat/message
 * @desc Publica un mensaje en el chat en vivo usando las credenciales del espectador
 */
router.post('/chat/message', verifyToken, async (req, res) => {
  try {
    const { message, broadcastId } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'message es requerido' });
    }
    if (!broadcastId) {
      return res.status(400).json({ success: false, message: 'broadcastId es requerido' });
    }

    const user = await User.findById(req.user.id).select('youtubeTokens');
    if (!user || !user.youtubeTokens) {
      return res.status(401).json({ success: false, message: 'El usuario no tiene YouTube conectado' });
    }

    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const youtube = google.youtube({ version: 'v3', auth: authClient });

    const { data: vid } = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [String(broadcastId)],
    });
    const item = Array.isArray(vid.items) && vid.items.length ? vid.items[0] : null;
    const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
    if (!liveChatId) {
      return res.status(400).json({ success: false, message: 'No se encontró activeLiveChatId para este broadcast' });
    }

    await youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: { messageText: message.trim() },
        },
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[YouTubeChat] Error publicando mensaje', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error publicando mensaje en YouTube Live Chat' });
  }
});

/**
 * @route GET /api/auth/youtube/channel
 * @desc Devuelve info del canal del usuario autenticado
 */
router.get('/channel', verifyToken, async (req, res) => {
  try {
    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const youtube = google.youtube({ version: 'v3', auth: authClient });

    const { data } = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true
    });

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontró canal de YouTube' });
    }

    const channel = data.items[0];
    const response = {
      title: channel.snippet?.title,
      thumbnail: channel.snippet?.thumbnails?.default?.url || channel.snippet?.thumbnails?.high?.url,
      subscribers: channel.statistics?.subscriberCount
    };

    // Actualizar la cantidad de suscriptores en el usuario e influencerProfile
    try {
      const user = await User.findById(req.user.id);
      if (user) {
        // Actualizar tokens
        if (!user.youtubeTokens) user.youtubeTokens = {};
        user.youtubeTokens.subscribers = Number(response.subscribers) || 0;

        // Asegurarse de tener influencerProfile inicializado
        if (user.influencerProfile) {
          const socialMedia = Array.isArray(user.influencerProfile.socialMedia) ? user.influencerProfile.socialMedia : [];

          // Encontrar o crear entrada de YouTube
          const ytIndex = socialMedia.findIndex(sm => (sm.platform || '').toLowerCase() === 'youtube');
          if (ytIndex !== -1) {
            socialMedia[ytIndex].followers = Number(response.subscribers) || 0;
          } else {
            socialMedia.push({
              platform: 'youtube',
              username: response.title || 'youtube',
              followers: Number(response.subscribers) || 0,
              url: ''
            });
          }

          // Recalcular totalFollowers
          const totalFollowers = socialMedia.reduce((sum, sm) => sum + (Number(sm.followers) || 0), 0);
          user.influencerProfile.socialMedia = socialMedia;

          // Inicializar stats si no existe
          user.influencerProfile.stats = user.influencerProfile.stats || {};
          user.influencerProfile.stats.totalFollowers = totalFollowers;
        }

        await user.save();
      }
    } catch (saveErr) {
      console.error('[YouTubeAuth] Error actualizando suscriptores en usuario', saveErr);
    }

    return res.json({ success: true, channel: response });
  } catch (err) {
    console.error('[YouTubeAuth] Error obteniendo info de canal', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error obteniendo info del canal de YouTube' });
  }
});

/**
 * @route GET /api/auth/youtube/live/preview
 * @desc Devuelve información de la transmisión en vivo o próxima del usuario
 */
router.get('/live/preview', verifyToken, async (req, res) => {
  try {
    const { getLivePreview } = require('../services/youtube.service');
    const info = await getLivePreview(req.user.id);
    if (!info) return res.status(404).json({ success: false, message: 'No se encontró transmisión en vivo o próxima.' });
    return res.json({ success: true, preview: info });
  } catch (err) {
    console.error('[YouTubeAuth] Error obteniendo vista previa live', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error obteniendo vista previa de YouTube Live' });
  }
});

router.get('/live/stats', verifyToken, async (req, res) => {
  try {
    const { broadcastId } = req.query;
    if (!broadcastId) {
      return res.status(400).json({ success: false, message: 'broadcastId es requerido' });
    }
    const apiKey = process.env.YT_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'YT_API_KEY no configurada en el backend' });
    }

    let lifecycleStatus = undefined;
    let videoId = String(broadcastId);

    try {
      const { getAuthorizedClient } = require('../services/youtube.service');
      const authClient = await getAuthorizedClient(req.user.id);
      const yt = google.youtube({ version: 'v3', auth: authClient });
      const { data: bData } = await yt.liveBroadcasts.list({
        part: ['status', 'contentDetails'],
        id: [String(broadcastId)],
      });
      if (bData.items && bData.items.length > 0) {
        const b = bData.items[0];
        lifecycleStatus = b.status?.lifeCycleStatus;
        videoId = b.contentDetails?.boundStreamId || videoId;
      }
    } catch (e) {}

    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'liveStreamingDetails,statistics',
        id: videoId,
        key: apiKey,
      },
    });
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron datos para el broadcast' });
    }
    const item = data.items[0];
    const viewerCount = Number(item?.liveStreamingDetails?.concurrentViewers || 0);
    const actualStartTime = item?.liveStreamingDetails?.actualStartTime || null;

    let commentCount = Number(item?.statistics?.commentCount || 0);
    const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
    if (liveChatId && apiKey) {
      try {
        let total = 0;
        let pageToken = undefined;
        for (let i = 0; i < 3; i++) {
          const { data: chatData } = await axios.get('https://www.googleapis.com/youtube/v3/liveChat/messages', {
            params: {
              part: 'id',
              liveChatId,
              key: apiKey,
              maxResults: 200,
              ...(pageToken ? { pageToken } : {}),
            },
          });
          const itemsCount = Array.isArray(chatData.items) ? chatData.items.length : 0;
          total += itemsCount;
          pageToken = chatData.nextPageToken;
          if (!pageToken) break;
        }
        if (total > 0) commentCount = total;
      } catch (e) {}
    }

    return res.json({ success: true, stats: { viewerCount, actualStartTime, commentCount, lifecycleStatus } });
  } catch (err) {
    console.error('[YouTubeAuth] Error obteniendo estadísticas live', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error obteniendo estadísticas de YouTube Live' });
  }
});

router.post('/live/setup', verifyToken, async (req, res) => {
  try {
    const { title, description, privacy = 'unlisted', scheduledStartTime } = req.body || {};
    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const yt = google.youtube({ version: 'v3', auth: authClient });

    const { data: streamData } = await yt.liveStreams.insert({
      part: ['snippet', 'cdn', 'contentDetails'],
      requestBody: {
        snippet: { title: title || 'MercadoTiendas Live' },
        cdn: { ingestionType: 'rtmp' },
        contentDetails: {},
      },
    });

    const stream = Array.isArray(streamData.items) && streamData.items.length ? streamData.items[0] : null;
    if (!stream) return res.status(500).json({ success: false, message: 'No se pudo crear el liveStream' });

    const { data: broadcastData } = await yt.liveBroadcasts.insert({
      part: ['snippet', 'status', 'contentDetails'],
      requestBody: {
        snippet: {
          title: title || 'MercadoTiendas Live',
          description: description || '',
          scheduledStartTime: scheduledStartTime || new Date().toISOString(),
        },
        status: { privacyStatus: String(privacy || 'unlisted') },
        contentDetails: { monitorStream: { enableMonitorStream: false }, enableAutoStart: true, enableAutoStop: true },
      },
    });

    const broadcast = Array.isArray(broadcastData.items) && broadcastData.items.length ? broadcastData.items[0] : null;
    if (!broadcast) return res.status(500).json({ success: false, message: 'No se pudo crear el liveBroadcast' });

    await yt.liveBroadcasts.bind({
      id: String(broadcast.id),
      part: ['id'],
      streamId: String(stream.id),
    });

    const ingestionAddress = stream.cdn?.ingestionInfo?.ingestionAddress || null;
    const streamName = stream.cdn?.ingestionInfo?.streamName || null;
    const response = {
      broadcastId: broadcast.id,
      streamId: stream.id,
      ingestionAddress,
      streamKey: streamName,
      title: broadcast.snippet?.title,
    };
    return res.json({ success: true, setup: response });
  } catch (err) {
    console.error('[YouTubeAuth] Error creando live', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error creando live de YouTube' });
  }
});

router.post('/live/start', verifyToken, async (req, res) => {
  try {
    const { broadcastId } = req.body || {};
    if (!broadcastId) return res.status(400).json({ success: false, message: 'broadcastId es requerido' });
    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const yt = google.youtube({ version: 'v3', auth: authClient });
    const { data: bData } = await yt.liveBroadcasts.list({ part: ['status','contentDetails'], id: [String(broadcastId)] });
    if (!bData.items || !bData.items.length) {
      return res.status(404).json({ success: false, message: 'No se encontró el broadcast' });
    }
    const b = bData.items[0];
    const streamId = b.contentDetails?.boundStreamId;
    if (!streamId) {
      return res.status(400).json({ success: false, message: 'El broadcast no tiene un stream vinculado' });
    }
    const { data: sData } = await yt.liveStreams.list({ part: ['status','cdn'], id: [String(streamId)] });
    const s = sData.items && sData.items.length ? sData.items[0] : null;
    const streamStatus = s?.status?.streamStatus; // expected: 'active' when encoder is pushing RTMP
    if (streamStatus !== 'active') {
      return res.status(400).json({ success: false, message: 'El stream RTMP no está activo. Inicia tu encoder y vuelve a intentar.' });
    }
    try {
      await yt.liveBroadcasts.transition({ id: String(broadcastId), part: ['status'], broadcastStatus: 'testing' });
    } catch (e) {}
    try {
      await yt.liveBroadcasts.transition({ id: String(broadcastId), part: ['status'], broadcastStatus: 'live' });
      return res.json({ success: true });
    } catch (err) {
      const msg = err?.response?.data?.error?.message || 'Error iniciando live de YouTube';
      return res.status(500).json({ success: false, message: msg });
    }
  } catch (err) {
    console.error('[YouTubeAuth] Error iniciando live', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error iniciando live de YouTube' });
  }
});

router.post('/live/stop', verifyToken, async (req, res) => {
  try {
    const { broadcastId } = req.body || {};
    if (!broadcastId) return res.status(400).json({ success: false, message: 'broadcastId es requerido' });
    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const yt = google.youtube({ version: 'v3', auth: authClient });
    await yt.liveBroadcasts.transition({ id: String(broadcastId), part: ['status'], broadcastStatus: 'complete' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[YouTubeAuth] Error finalizando live', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error finalizando live de YouTube' });
  }
});

router.post('/gateway/start', verifyToken, async (req, res) => {
  try {
    const { broadcastId } = req.body || {};
    if (!broadcastId) return res.status(400).json({ success: false, message: 'broadcastId es requerido' });
    const gatewayBase = process.env.YT_GATEWAY_URL;
    if (!gatewayBase) return res.status(500).json({ success: false, message: 'YT_GATEWAY_URL no configurado en el backend' });
    const { getAuthorizedClient } = require('../services/youtube.service');
    const authClient = await getAuthorizedClient(req.user.id);
    const yt = google.youtube({ version: 'v3', auth: authClient });
    const { data: bData } = await yt.liveBroadcasts.list({ part: ['contentDetails'], id: [String(broadcastId)] });
    if (!bData.items || !bData.items.length) return res.status(404).json({ success: false, message: 'Broadcast no encontrado' });
    const streamId = bData.items[0].contentDetails?.boundStreamId;
    if (!streamId) return res.status(400).json({ success: false, message: 'Broadcast sin stream vinculado' });
    const { data: sData } = await yt.liveStreams.list({ part: ['cdn'], id: [String(streamId)] });
    if (!sData.items || !sData.items.length) return res.status(404).json({ success: false, message: 'Stream no encontrado' });
    const s = sData.items[0];
    const address = s.cdn?.ingestionInfo?.ingestionAddress;
    const key = s.cdn?.ingestionInfo?.streamName;
    if (!address || !key) return res.status(400).json({ success: false, message: 'Faltan datos de ingestión' });
    const rtmpUrl = `${address}/${key}`;
    const { data } = await axios.post(`${gatewayBase}/start`, { rtmpUrl });
    const sessionId = data?.sessionId || data?.id || null;
    if (sessionId) gatewaySessions.set(String(broadcastId), sessionId);
    return res.json({ success: true, sessionId });
  } catch (err) {
    console.error('[YouTubeGateway] Error iniciando pasarela', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error iniciando pasarela' });
  }
});

router.post('/gateway/stop', verifyToken, async (req, res) => {
  try {
    const { broadcastId, sessionId: sid } = req.body || {};
    const gatewayBase = process.env.YT_GATEWAY_URL;
    if (!gatewayBase) return res.status(500).json({ success: false, message: 'YT_GATEWAY_URL no configurado en el backend' });
    const sessionId = sid || gatewaySessions.get(String(broadcastId));
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId faltante' });
    await axios.post(`${gatewayBase}/stop`, { sessionId });
    if (broadcastId) gatewaySessions.delete(String(broadcastId));
    return res.json({ success: true });
  } catch (err) {
    console.error('[YouTubeGateway] Error deteniendo pasarela', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Error deteniendo pasarela' });
  }
});

module.exports = router;
