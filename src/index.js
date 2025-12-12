const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config');
const fs = require('fs');
const https = require('https');
const path = require('path');
const mongoose = require('mongoose');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { PassThrough } = require('stream');
const connectDB = require('./config/database');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middlewares/error');
const { setupStaticMiddleware } = require('./middlewares/static.middleware');

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

const allowedOrigins = [
  'https://mercadotiendas-pr-testing.onrender.com',
  'http://localhost:3000'
];

const allowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Cache-Control',
  'Accept',
  'Origin'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders,
  credentials: true
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
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
    origin: [
      'https://mercadotiendas-pr-testing.onrender.com',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders,
    credentials: true
  }
});

// Mapa para llevar un intervalo por cada sala de evento
const eventIntervals = new Map();

// Exponer instancia de io a través de la app para usarla en controladores
app.set('io', io);

ffmpeg.setFfmpegPath(ffmpegPath);

io.on('connection', (socket) => {
  console.log('Cliente Socket.IO conectado:', socket.id);

  let muxRelay = null;
  let streamChunkCount = 0;

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

  const handleMuxRelayStart = (payload) => {
    const eventId = payload?.eventId;
    const rtmpUrl = payload?.rtmpUrl || 'rtmp://global-live.mux.com:5222/app';
    const streamKey = payload?.streamKey;
    if (!eventId || !streamKey) return;

    const maskedKey = typeof streamKey === 'string' && streamKey.length > 6
      ? `${streamKey.slice(0, streamKey.length - 6)}******`
      : '****';

    console.log('Recibido start-stream', {
      socketId: socket.id,
      eventId,
      streamKey: maskedKey
    });

    if (muxRelay && muxRelay.command) {
      try {
        if (muxRelay.input && !muxRelay.input.destroyed) {
          muxRelay.input.end();
        }
        muxRelay.command.kill('SIGKILL');
      } catch {}
      muxRelay = null;
    }

    streamChunkCount = 0;
    const finalUrl = `${rtmpUrl.replace(/\/+$/, '')}/${streamKey}`;
    const inputStream = new PassThrough();

    const command = ffmpeg()
      .input(inputStream)
      .inputFormat('webm')
      .outputOptions('-threads 2')
      .videoCodec('libx264')
      .videoBitrate('2500k')
      .addOption('-preset', 'veryfast')
      .addOption('-tune', 'zerolatency')
      .addOption('-maxrate', '2500k')
      .addOption('-bufsize', '5000k')
      .addOption('-r', '30')
      .addOption('-g', '60')
      .addOption('-keyint_min', '60')
      .addOption('-sc_threshold', '0')
      .addOption('-pix_fmt', 'yuv420p')
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioChannels(2)
      .audioFrequency(48000)
      .format('flv')
      .output(finalUrl);

    const room = `event_${eventId}`;

    command.on('start', (cmdline) => {
      console.log('FFmpeg start', { eventId, cmdline });
      try {
        io.to(room).emit('muxRelayState', { eventId, state: 'starting' });
      } catch {}
    });

    command.on('stderr', (line) => {
      console.error('FFmpeg stderr', { eventId, line });
      try {
        io.to(room).emit('muxRelayLog', { eventId, log: line });
      } catch {}
    });

    command.on('error', (err, stdout, stderr) => {
      console.error('FFmpeg error', { eventId, error: err.message, stdout, stderr });
      try {
        io.to(room).emit('muxRelayState', { eventId, state: 'error' });
      } catch {}
      muxRelay = null;
    });

    command.on('end', () => {
      console.log('FFmpeg end', { eventId });
      try {
        io.to(room).emit('muxRelayState', { eventId, state: 'closed' });
      } catch {}
      muxRelay = null;
    });

    muxRelay = { eventId, command, input: inputStream };
    socket.data = socket.data || {};
    socket.data.ffmpegCommand = command;

    command.run();
  };

  const handleMuxRelayChunk = (payload) => {
    const eventId = payload?.eventId;
    const raw = payload?.chunk ?? payload?.data;
    if (!muxRelay || !muxRelay.input || muxRelay.eventId !== eventId) return;
    streamChunkCount += 1;
    if (streamChunkCount % 100 === 0) {
      console.log('Recibiendo datos de video', {
        socketId: socket.id,
        eventId,
        chunks: streamChunkCount
      });
    }
    if (!raw) return;
    let buf;
    if (Buffer.isBuffer(raw)) buf = raw;
    else if (raw instanceof ArrayBuffer) buf = Buffer.from(raw);
    else buf = Buffer.from(raw);
    try {
      muxRelay.input.write(buf);
    } catch {}
  };

  const handleMuxRelayStop = (payload) => {
    const eventId = payload?.eventId;
    if (!muxRelay || muxRelay.eventId !== eventId) return;
    try {
      if (muxRelay.input && !muxRelay.input.destroyed) {
        muxRelay.input.end();
      }
      if (muxRelay.command) {
        muxRelay.command.kill('SIGKILL');
      }
    } catch {}
    muxRelay = null;
    if (socket.data && socket.data.ffmpegCommand) {
      socket.data.ffmpegCommand = null;
    }
  };

  socket.on('joinUserRoom', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      socket.data = socket.data || {};
      socket.data.joinedUserId = userId;
      console.log(`Socket ${socket.id} joined user room user_${userId}`);
    }
  });

  socket.on('muxRelayStart', handleMuxRelayStart);
  socket.on('muxRelayChunk', handleMuxRelayChunk);
  socket.on('muxRelayStop', handleMuxRelayStop);
  socket.on('start-stream', handleMuxRelayStart);
  socket.on('stream-data', handleMuxRelayChunk);
  socket.on('stop-stream', handleMuxRelayStop);
  socket.on('end-stream', handleMuxRelayStop);

  socket.on('disconnect', async () => {
    console.log('Cliente Socket.IO desconectado:', socket.id);
    if (muxRelay && muxRelay.command) {
      try {
        if (muxRelay.input && !muxRelay.input.destroyed) {
          muxRelay.input.end();
        }
        muxRelay.command.kill('SIGKILL');
      } catch {}
      muxRelay = null;
    }
    const eventId = socket.data?.joinedEventId;
    if (!eventId) return;

    const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
    const currentViewers = room ? room.size : 0;
    try {
      io.to(`event_${eventId}`).emit('chat:userCount', { eventId, count: currentViewers });
    } catch (_) {}

    try {
      const LiveEventMetrics = require('./models/LiveEventMetrics');
      const metricsDoc = await LiveEventMetrics.findOne({ event: eventId });
      if (!metricsDoc) return;

      const prevAvg = metricsDoc.avgConcurrentViewers || 0;
      const prevDuration = metricsDoc.durationSeconds || 0;
      const newDuration = prevDuration + 1;
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

      io.to(`event_${eventId}`).emit('metricsUpdated', {
        eventId,
        metrics: { ...metricsDoc.toObject(), ...update.$set }
      });

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
