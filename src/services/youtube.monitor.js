const axios = require('axios');
const { config } = require('../config');

// Map to hold interval references per event
const monitorIntervals = new Map(); // eventId -> intervalId
// Map to store viewer counts history per event for metrics calculation
const viewersHistory = new Map(); // eventId -> number[]

const POLL_INTERVAL_MS = Number(process.env.YT_MONITOR_INTERVAL_MS) || 60000; // default 60s
const YT_API_KEY = process.env.YT_API_KEY;
if (!YT_API_KEY) {
  console.warn('[YouTubeMonitor] La variable de entorno YT_API_KEY no está definida. El monitoreo de YouTube no funcionará.');
}

/**
 * Inicia el monitoreo de viewers concurrentes de una transmisión en YouTube
 * @param {string} eventId - ID del LiveEvent en la base de datos
 * @param {string} youtubeVideoId - ID del video de YouTube Live
 */
function start(eventId, youtubeVideoId) {
  if (!YT_API_KEY) return;
  if (!eventId || !youtubeVideoId) {
    console.warn('[YouTubeMonitor] eventId o youtubeVideoId faltantes al iniciar');
    return;
  }
  // Evitar iniciar múltiples intervalos para el mismo evento
  if (monitorIntervals.has(eventId)) {
    return;
  }

  console.log(`[YouTubeMonitor] Iniciando monitoreo para evento ${eventId} (videoId=${youtubeVideoId})`);

  viewersHistory.set(eventId, []);

  const intervalId = setInterval(async () => {
    try {
      const apiUrl = 'https://www.googleapis.com/youtube/v3/videos';
      const { data } = await axios.get(apiUrl, {
        params: {
          part: 'liveStreamingDetails',
          id: youtubeVideoId,
          key: YT_API_KEY,
        },
      });

      if (!data.items || data.items.length === 0) {
        console.warn(`[YouTubeMonitor] No se encontró información de liveStreamingDetails para ${youtubeVideoId}`);
        return;
      }

      const concurrentViewers = parseInt(
        data.items[0]?.liveStreamingDetails?.concurrentViewers || '0',
        10,
      );

      const liveChatId = data.items[0]?.liveStreamingDetails?.activeLiveChatId;
      const channelId = data.items[0]?.snippet?.channelId;

      if (Number.isNaN(concurrentViewers)) {
        console.warn(`[YouTubeMonitor] concurrentViewers no numérico para ${youtubeVideoId}`);
        return;
      }

      // Guardar en historial para métricas
      const historyArr = viewersHistory.get(eventId);
      if (Array.isArray(historyArr)) {
        historyArr.push(concurrentViewers);
      }

      // Enviar snapshot a nuestro backend
      const backendBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${config.port}`;
      await axios.post(`${backendBaseUrl}/api/live-events/${eventId}/viewers-snapshot`, {
        viewersCount: concurrentViewers,
      }).catch(err => {
        console.error('[YouTubeMonitor] Error enviando viewer snapshot', err.response?.data || err.message);
      });

      // Obtener nuevos mensajes de chat y subs si aplica
      let commentsDelta = 0;
      let newFollowersDelta = 0;
      if (liveChatId) {
        const { itemsCount, nextToken } = await getNewChatCount(liveChatId, chatPageTokens.get(eventId));
        if (itemsCount > 0) {
          commentsDelta = itemsCount;
        }
        if (nextToken) chatPageTokens.set(eventId, nextToken);
      }
      if (channelId) {
        const currentSubs = await getSubscriberCount(channelId);
        if (currentSubs !== null) {
          const prev = prevSubsMap.get(eventId) || currentSubs;
          if (currentSubs > prev) {
            newFollowersDelta = currentSubs - prev;
          }
          prevSubsMap.set(eventId, currentSubs);
        }
      }

      // Enviar métricas de engagement si hay cambios
      if (commentsDelta || newFollowersDelta) {
        const body = {};
        if (commentsDelta) body.comments = commentsDelta;
        if (newFollowersDelta) body.newFollowers = newFollowersDelta;
        await axios.patch(`${backendBaseUrl}/api/live-events/${eventId}/metrics`, body)
          .catch(err => {
            console.error('[YouTubeMonitor] Error enviando métricas engagement', err.response?.data || err.message);
          });
      }
    } catch (error) {
      console.error('[YouTubeMonitor] Error obteniendo viewers', error.response?.data || error.message);
    }
  }, POLL_INTERVAL_MS);

  monitorIntervals.set(eventId, { intervalId, youtubeVideoId });
}

/**
 * Detiene el monitoreo de viewers para un evento y envía métricas agregadas a backend.
 * @param {string} eventId - ID del LiveEvent
 */
function stop(eventId) {
  if (!monitorIntervals.has(eventId)) {
    return;
  }
  const { intervalId } = monitorIntervals.get(eventId);
  clearInterval(intervalId);
  monitorIntervals.delete(eventId);

  const historyArr = viewersHistory.get(eventId) || [];
  viewersHistory.delete(eventId);

  if (historyArr.length === 0) {
    console.warn(`[YouTubeMonitor] No se recopilaron viewers para evento ${eventId}`);
    return;
  }

  const peakViewers = Math.max(...historyArr);
  const avgConcurrentViewers = Math.round(historyArr.reduce((a, b) => a + b, 0) / historyArr.length);

  const backendBaseUrl = process.env.BACKEND_BASE_URL || `http://localhost:${config.port}`;
  axios.patch(`${backendBaseUrl}/api/live-events/${eventId}/metrics`, {
    peakViewers,
    avgConcurrentViewers,
  }).catch(err => {
    console.error('[YouTubeMonitor] Error enviando métricas finales', err.response?.data || err.message);
  });

  console.log(`[YouTubeMonitor] Monitoreo detenido para evento ${eventId}. Peak=${peakViewers}, Avg=${avgConcurrentViewers}`);
}

module.exports = {
  start,
  stop,
};

const chatPageTokens = new Map(); // eventId -> nextPageToken for liveChat
const prevSubsMap = new Map(); // eventId -> previous subscriber count

// helper to fetch subscriber count for a channel
async function getSubscriberCount(channelId) {
  try {
    const apiUrl = 'https://www.googleapis.com/youtube/v3/channels';
    const { data } = await axios.get(apiUrl, {
      params: {
        part: 'statistics',
        id: channelId,
        key: YT_API_KEY,
      },
    });
    if (!data.items || data.items.length === 0) return null;
    return parseInt(data.items[0].statistics.subscriberCount || '0', 10);
  } catch (err) {
    console.error('[YouTubeMonitor] Error obteniendo subscribers', err.response?.data || err.message);
    return null;
  }
}

// helper to fetch new chat messages count since last pageToken
async function getNewChatCount(liveChatId, pageToken) {
  try {
    const apiUrl = 'https://www.googleapis.com/youtube/v3/liveChat/messages';
    const params = {
      part: 'id',
      liveChatId,
      key: YT_API_KEY,
      maxResults: 200,
      ...(pageToken ? { pageToken } : {}),
    };
    const { data } = await axios.get(apiUrl, { params });
    const nextToken = data.nextPageToken;
    const itemsCount = Array.isArray(data.items) ? data.items.length : 0;
    return { itemsCount, nextToken };
  } catch (err) {
    console.error('[YouTubeMonitor] Error obteniendo mensajes de chat', err.response?.data || err.message);
    return { itemsCount: 0, nextToken: null };
  }
}