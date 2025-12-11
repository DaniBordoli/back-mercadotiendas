const axios = require('axios');

function getAuth() {
  const id = (process.env.MUX_TOKEN_ID || '').trim();
  const secret = (process.env.MUX_TOKEN_SECRET || '').trim();
  if (!id || !secret) throw new Error('Mux credentials missing');
  return { username: id, password: secret };
}

async function createLiveStream(opts = {}) {
  const auth = getAuth();
  const body = {
    playback_policy: ['public'],
    new_asset_settings: { playback_policy: ['public'] },
    latency_mode: opts.latency_mode || 'low',
    reconnect_window: opts.reconnect_window || 60,
    ...(opts.test === true ? { test: true } : {}),
  };
  try {
    const { data } = await axios.post('https://api.mux.com/video/v1/live-streams', body, { auth });
    const ls = data && data.data ? data.data : data;
    return {
      id: ls.id,
      streamKey: ls.stream_key,
      rtmpUrl: (ls.ingest && ls.ingest.url) || 'rtmp://global-live.mux.com:5222/app',
      playbackId: Array.isArray(ls.playback_ids) && ls.playback_ids.length ? ls.playback_ids[0].id : null,
      status: ls.status || null,
    };
  } catch (err) {
    const status = err?.response?.status;
    const payload = err?.response?.data;
    let message = 'Mux createLiveStream failed';
    if (status) message += ` (${status})`;
    if (payload) {
      try {
        if (payload.error?.messages && Array.isArray(payload.error.messages)) {
          message += `: ${payload.error.messages.join('; ')}`;
        } else if (payload.error?.message) {
          message += `: ${payload.error.message}`;
        } else if (payload.errors && Array.isArray(payload.errors)) {
          message += `: ${payload.errors.map(e => e.message || e).join('; ')}`;
        } else {
          message += `: ${JSON.stringify(payload)}`;
        }
      } catch (_) {}
    }
    const e = new Error(message);
    e.code = status;
    throw e;
  }
}

async function disableLiveStream(liveStreamId) {
  const auth = getAuth();
  await axios.put(`https://api.mux.com/video/v1/live-streams/${liveStreamId}/disable`, {}, { auth });
  return true;
}

async function getLiveStream(liveStreamId) {
  const auth = getAuth();
  const { data } = await axios.get(`https://api.mux.com/video/v1/live-streams/${liveStreamId}`, { auth });
  return data && data.data ? data.data : data;
}

module.exports = { createLiveStream, disableLiveStream, getLiveStream };
