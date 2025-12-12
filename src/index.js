const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config');
const fs = require('fs');
const https = require('https');
const path = require('path');
const mongoose = require('mongoose');
const ffmpegStatic = require('ffmpeg-static');
const { spawn } = require('child_process');
const connectDB = require('./config/database');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/error');
const { setupStaticMiddleware } = require('./middlewares/static.middleware');
const { verifyToken: verifyJwtToken } = require('./utils/jwt');
const LiveEvent = require('./models/LiveEvent');

const app = express();

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Conectar a MongoDB
connectDB();

// --- Migración de índice: eliminar índice único (campaign + user) en CampaignApplication ---
// Permite re-postular cuando la previa fue "rejected". Ejecuta una sola vez tras la conexión.
mongoose.connection.once('open', async () => {
  try {
    const { CampaignApplication } = require('./models');
    const indexes = await CampaignApplication.collection.indexes();
    const hasUnique = indexes.some((ix) => ix.name === 'campaign_1_user_1' && ix.unique);
    if (hasUnique) {
      await CampaignApplication.collection.dropIndex('campaign_1_user_1');
      console.log('🔧 Eliminado índice único campaign_1_user_1 en CampaignApplication');
    }
  } catch (err) {
    console.warn('No se pudo eliminar el índice campaign_1_user_1:', err.message);
  }
});

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Configurar middleware para archivos estáticos
setupStaticMiddleware(app);

// Routes
app.use('/api', routes);

// Serve frontend build (SPA fallback)
const frontendBuildPath = path.join(__dirname, '../../front-mercadotiendas/build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }

    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start HTTP server
const server = app.listen(config.port, () => {
  console.log(`HTTP server running on port ${config.port}`);
});

// --- Socket.IO setup ---
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

// Mapa para llevar un intervalo por cada sala de evento
const eventIntervals = new Map();
// Mapa de relays Mux activos (socket -> ffmpeg)
const muxRelays = new Map();

// Exponer instancia de io a través de la app para usarla en controladores
app.set('io', io);

const stopMuxRelay = (eventId) => {
  const relay = muxRelays.get(String(eventId));
  if (!relay) return;
  try { relay.ffmpeg?.stdin?.end(); } catch (_) {}
  try { relay.ffmpeg?.kill('SIGINT'); } catch (_) {}
  muxRelays.delete(String(eventId));
};

io.on('connection', (socket) => {
  console.log('Cliente Socket.IO conectado:', socket.id);

  const emitMuxRelayState = (eventId, state) => {
    try {
      socket.emit('muxRelayState', { eventId, state });
      io.to(`event_${eventId}`).emit('muxRelayState', { eventId, state });
    } catch (_) {}
  };

  socket.on('muxRelay:start', async (payload, cb) => {
    const ack = (obj) => {
      if (typeof cb === 'function') cb(obj);
      if (!obj?.success && payload?.eventId) emitMuxRelayState(String(payload.eventId), 'error');
    };
    try {
      const eventId = String(payload?.eventId || '').trim();
      const streamKey = String(payload?.streamKey || '').trim();
      if (!eventId || !streamKey) return ack({ success: false, message: 'missing params' });
      let ingestUrl = typeof payload?.ingestUrl === 'string' && payload.ingestUrl
        ? String(payload.ingestUrl)
        : 'rtmp://global-live.mux.com:5222/app';
      const transport = String(payload?.transport || '').toLowerCase();
      try {
        const raw = ingestUrl.trim();
        if (raw.startsWith('rtmp://') && transport !== 'rtmp') {
          const hostPath = raw.slice('rtmp://'.length);
          const parts = hostPath.split('/');
          const host = parts.shift() || 'global-live.mux.com:5222';
          const [hostname, port] = host.split(':');
          const safePort = port && port !== '' ? port : '5222';
          const finalPort = safePort === '5222' ? '443' : safePort;
          ingestUrl = `rtmps://${hostname}:${finalPort}/${parts.join('/')}`;
        }
      } catch (_) {}

      let userId = null;
      try {
        const decoded = verifyJwtToken(String(payload?.token || ''));
        userId = decoded?.id || null;
      } catch (_) {}
      if (!userId) return ack({ success: false, message: 'auth failed' });

      const event = await LiveEvent.findOne({ _id: eventId, owner: userId }).select('_id');
      if (!event) return ack({ success: false, message: 'event not found' });

      stopMuxRelay(eventId);

      const dest = `${ingestUrl.replace(/\/+$/, '')}/${streamKey}`;
      try {
        console.info('muxRelayWS: request accepted', { eventId: String(event._id), ingestUrl, streamKeyLen: streamKey.length });
      } catch (_) {}

      const args = [
        '-re',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-fflags', '+genpts',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-r', '30',
        '-g', '60',
        '-keyint_min', '60',
        '-sc_threshold', '0',
        '-max_interleave_delta', '0',
        '-c:a', 'aac',
        '-ar', '44100',
        '-b:a', '128k',
        '-f', 'flv',
        '-rtmp_live', 'live',
        dest
      ];

      const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
      const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      muxRelays.set(String(event._id), { ffmpeg, socketId: socket.id, totalBytes: 0, firstChunk: true });
      socket.data = socket.data || {};
      socket.data.muxRelayEventId = String(event._id);
      emitMuxRelayState(String(event._id), 'starting');
      ack({ success: true });

      ffmpeg.on('close', (code, signal) => {
        try {
          console.info('muxRelayWS: ffmpeg closed', { eventId: String(event._id), code, signal });
        } catch (_) {}
        emitMuxRelayState(String(event._id), 'closed');
        stopMuxRelay(event._id);
      });
      ffmpeg.on('error', (err) => {
        try {
          console.error('muxRelayWS: ffmpeg error', { eventId: String(event._id), message: err?.message });
        } catch (_) {}
        emitMuxRelayState(String(event._id), 'error');
        stopMuxRelay(event._id);
      });
      ffmpeg.stderr.on('data', (chunk) => {
        try {
          const msg = chunk.toString();
          io.to(`event_${event._id}`).emit('muxRelayLog', { eventId: String(event._id), log: msg });
          if (/error|fail|denied|invalid|unauthorized/i.test(msg)) {
            console.error('muxRelayWS: ffmpeg stderr', { eventId: String(event._id), msg: msg.slice(0, 200) });
          }
        } catch (_) {}
      });
    } catch (err) {
      try {
        console.error('muxRelayWS:start error', err?.message || err);
      } catch (_) {}
      ack({ success: false, message: 'internal error' });
    }
  });

  socket.on('muxRelay:chunk', (payload) => {
    const eventId = String(payload?.eventId || '').trim();
    const relay = eventId ? muxRelays.get(eventId) : null;
    if (!relay || relay.socketId !== socket.id || !payload?.chunk) return;
    try {
      const buf = Buffer.isBuffer(payload.chunk) ? payload.chunk : Buffer.from(payload.chunk);
      relay.totalBytes += buf.length;
      if (relay.firstChunk) {
        relay.firstChunk = false;
        emitMuxRelayState(eventId, 'streaming');
        try { console.info('muxRelayWS: first chunk', { eventId, bytes: buf.length }); } catch (_) {}
      }
      relay.ffmpeg.stdin.write(buf);
    } catch (err) {
      try { console.error('muxRelayWS: write error', { eventId, message: err?.message }); } catch (_) {}
      emitMuxRelayState(eventId, 'error');
      stopMuxRelay(eventId);
    }
  });

  socket.on('muxRelay:stop', (payload) => {
    const eventId = String(payload?.eventId || '').trim();
    const relay = eventId ? muxRelays.get(eventId) : null;
    if (!eventId || (relay && relay.socketId !== socket.id)) return;
    stopMuxRelay(eventId);
    emitMuxRelayState(eventId, 'closed');
  });

  // Permite que el cliente se una a una sala específica del evento si envía eventId
  socket.on('joinEventRoom', async (payload) => {
    const eventId = typeof payload === 'string' ? payload : payload?.eventId;
    if (eventId) {
      socket.join(`event_${eventId}`);
      socket.data = socket.data || {};
      socket.data.joinedEventId = eventId;
      if (payload && typeof payload === 'object') {
        if (payload.role) socket.data.role = payload.role;
        if (payload.viewerId) socket.data.viewerId = payload.viewerId;
      }

      try {
        // Cargar modelos de manera perezosa para evitar dependencias circulares
        const LiveEventMetrics = require('./models/LiveEventMetrics');
        const LiveEvent = require('./models/LiveEvent');

        const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
        let currentViewers = 0;
        if (room) {
          for (const id of room) {
            const s = io.sockets.sockets.get(id);
            if (!s || s.data?.joinedEventId !== eventId) continue;
            if (!s.data?.role || s.data.role === 'viewer') currentViewers++;
          }
        }

        try {
          io.to(`event_${eventId}`).emit('chat:userCount', { eventId, count: currentViewers });
        } catch (_) {}

        let isLive = false;
        try {
          const liveEvent = await LiveEvent.findById(eventId).select('startDateTime status updatedAt');
          if (liveEvent) {
            isLive = String(liveEvent.status) === 'live';
          }
        } catch {}
        if (isLive) {
          try {
            const LiveEventViewerSnapshot = require('./models/LiveEventViewerSnapshot');
            const ts = new Date();
            await LiveEventViewerSnapshot.create({ event: eventId, viewersCount: currentViewers, timestamp: ts });
            try {
              io.to(`event_${eventId}`).emit('viewerCountUpdated', { eventId, viewersCount: currentViewers, timestamp: ts });
            } catch {}
          } catch (snapErr) {}
        }

        // --- Cálculo de duración y promedio de concurrentes ---
        // Primero, calculamos durationSeconds actual basado en la hora de inicio del evento
        let calculatedDurationSeconds;
        try {
          const liveEvent = await LiveEvent.findById(eventId).select('startDateTime status updatedAt');
          if (liveEvent && liveEvent.startDateTime) {
            const endTime = liveEvent.status === 'finished' && liveEvent.updatedAt ? liveEvent.updatedAt : new Date();
            const diffMs = endTime.getTime() - new Date(liveEvent.startDateTime).getTime();
            calculatedDurationSeconds = Math.max(1, Math.floor(diffMs / 1000)); // al menos 1s para evitar división por cero
          }
        } catch (err) {
          console.warn('No se pudo calcular durationSeconds en joinEventRoom', err.message);
        }

        // Recuperar métricas existentes para calcular nuevo promedio de espectadores concurrentes
        let existingMetrics = await LiveEventMetrics.findOne({ event: eventId });
        const prevAvg = existingMetrics?.avgConcurrentViewers || 0;
        const prevDuration = existingMetrics?.durationSeconds || 0;
        const durationForAvg = calculatedDurationSeconds ?? prevDuration;

        // Calcular nuevo promedio ponderado de espectadores concurrentes
        let newAvgConcurrent = prevAvg;
        if (durationForAvg > 0) {
          newAvgConcurrent = ((prevAvg * prevDuration) + currentViewers) / (prevDuration + 1);
        } else {
          newAvgConcurrent = currentViewers;
        }

        // Construir objeto de actualización
        const update = {
          $max: { peakViewers: currentViewers },
          $set: {
            avgConcurrentViewers: Math.round(newAvgConcurrent),
            ...(durationForAvg !== undefined ? { durationSeconds: durationForAvg } : {})
          }
        };

        // Actualizar o crear métricas automáticamente
        const metrics = await LiveEventMetrics.findOneAndUpdate(
          { event: eventId },
          update,
          { new: true, upsert: true }
        );

        // Emitir actualización a la sala
        io.to(`event_${eventId}`).emit('metricsUpdated', { eventId, metrics });

        // Iniciar intervalo para capturar avgConcurrentViewers cada 30s si aún no existe
        if (!eventIntervals.has(eventId)) {
          const intervalId = setInterval(async () => {
            try {
              const roomNow = io.sockets.adapter.rooms.get(`event_${eventId}`);
              let viewersNow = 0;
              if (roomNow) {
                for (const id of roomNow) {
                  const s = io.sockets.sockets.get(id);
                  if (!s || s.data?.joinedEventId !== eventId) continue;
                  if (!s.data?.role || s.data.role === 'viewer') viewersNow++;
                }
              }
              const liveEvent = await LiveEvent.findById(eventId).select('startDateTime status updatedAt');
              if (!liveEvent || !liveEvent.startDateTime) return;

              const endTime = liveEvent.status === 'finished' && liveEvent.updatedAt ? liveEvent.updatedAt : new Date();
              const diffMs = endTime.getTime() - new Date(liveEvent.startDateTime).getTime();
              const durationSeconds = Math.max(1, Math.floor(diffMs / 1000));

              const metricsCurrent = await LiveEventMetrics.findOne({ event: eventId });
              const prevAvgI = metricsCurrent?.avgConcurrentViewers || 0;
              const prevDurI = metricsCurrent?.durationSeconds || 0;
              const newAvgI = ((prevAvgI * prevDurI) + viewersNow) / (durationSeconds);

              const updated = await LiveEventMetrics.findOneAndUpdate(
                { event: eventId },
                { $set: { avgConcurrentViewers: Math.round(newAvgI), durationSeconds } },
                { new: true, upsert: true }
              );

              io.to(`event_${eventId}`).emit('metricsUpdated', { eventId, metrics: updated });

              if (String(liveEvent.status) === 'live') {
                try {
                  const LiveEventViewerSnapshot = require('./models/LiveEventViewerSnapshot');
                  const ts2 = new Date();
                  await LiveEventViewerSnapshot.create({ event: eventId, viewersCount: viewersNow, timestamp: ts2 });
                  try { io.to(`event_${eventId}`).emit('viewerCountUpdated', { eventId, viewersCount: viewersNow, timestamp: ts2 }); } catch {}
                } catch {}
              }

              // Si el evento terminó, limpiamos intervalo
              if (liveEvent.status === 'finished') {
                clearInterval(intervalId);
                eventIntervals.delete(eventId);
              }
            } catch (iErr) {
              console.error('Error en intervalo de métricas', iErr);
            }
          }, 30000); // cada 30 segundos

          eventIntervals.set(eventId, intervalId);
        }
      } catch (err) {
        console.error('Error actualizando métricas en joinEventRoom:', err);
      }
    }
  });

  // Permite que el cliente se una a su sala personal de usuario para recibir notificaciones en tiempo real
  // El frontend debe emitir 'joinUserRoom' con el userId después de autenticarse
  socket.on('joinUserRoom', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      socket.data = socket.data || {};
      socket.data.joinedUserId = userId;
      console.log(`Socket ${socket.id} joined user room user_${userId}`);
    }
  });

  socket.on('disconnect', async () => {
    console.log('Cliente Socket.IO desconectado:', socket.id);
    if (socket.data?.muxRelayEventId) {
      stopMuxRelay(socket.data.muxRelayEventId);
      emitMuxRelayState(socket.data.muxRelayEventId, 'closed');
    }
    const eventId = socket.data?.joinedEventId;
    if (!eventId) return;

    // Obtenemos la sala y el número actual de espectadores tras la desconexión
    const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
    const currentViewers = room ? room.size : 0;
    try {
      io.to(`event_${eventId}`).emit('chat:userCount', { eventId, count: currentViewers });
    } catch (_) {}

    try {
      const LiveEventMetrics = require('./models/LiveEventMetrics');
      const metricsDoc = await LiveEventMetrics.findOne({ event: eventId });
      if (!metricsDoc) return;

      // Recalcular avgConcurrentViewers si hay duración disponible
      const prevAvg = metricsDoc.avgConcurrentViewers || 0;
      const prevDuration = metricsDoc.durationSeconds || 0;
      const newDuration = prevDuration + 1; // sumamos 1 segundo al tiempo acumulado mínimo
      let newAvg = prevAvg;
      if (newDuration > 0) {
        newAvg = ((prevAvg * prevDuration) + currentViewers) / newDuration;
      }

      const update = {
        $set: {
          avgConcurrentViewers: Math.round(newAvg),
          durationSeconds: newDuration,
        }
      };

      await LiveEventMetrics.updateOne({ event: eventId }, update);

      // Emitir actualización a la sala restante si quedan espectadores
      io.to(`event_${eventId}`).emit('metricsUpdated', {
        eventId,
        metrics: { ...metricsDoc.toObject(), ...update.$set }
      });

      // Si ya no hay espectadores, limpiar intervalo de la sala
      if (currentViewers === 0 && eventIntervals.has(eventId)) {
        clearInterval(eventIntervals.get(eventId));
        eventIntervals.delete(eventId);
      }
    } catch (e) {
      console.error('Error actualizando métricas en disconnect', e);
    }
  });
});

// Optional HTTPS server
if (process.env.ENABLE_HTTPS === 'true') {
  try {
    const keyPath = path.resolve(__dirname, '..', process.env.SSL_KEY_FILE || 'cert/local.key');
    const certPath = path.resolve(__dirname, '..', process.env.SSL_CERT_FILE || 'cert/local.crt');

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    const httpsPort = process.env.HTTPS_PORT || 3003;

    https.createServer(httpsOptions, app).listen(httpsPort, () => {
      console.log(`HTTPS server running on port ${httpsPort}`);
    });
  } catch (err) {
    console.error('Failed to start HTTPS server:', err.message);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Cerrar servidor y salir
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Cerrar servidor y salir
  server.close(() => {
    process.exit(1);
  });
});
