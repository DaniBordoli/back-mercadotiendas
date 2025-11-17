const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { config } = require('./config');
const fs = require('fs');
const https = require('https');
const path = require('path');
const mongoose = require('mongoose');
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

// Middlewares
app.use(cors());
app.use(morgan('dev'));
// Aumentar el límite de tamaño de las peticiones JSON/URL-encoded para permitir payloads más grandes (por ejemplo, imágenes en base64)
app.use(express.json({ limit: '10mb' }));
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

// Exponer instancia de io a través de la app para usarla en controladores
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Cliente Socket.IO conectado:', socket.id);

  // Permite que el cliente se una a una sala específica del evento si envía eventId
  socket.on('joinEventRoom', async (eventId) => {
    if (eventId) {
      socket.join(`event_${eventId}`);
      // Guardamos en la instancia del socket qué evento sigue este cliente
      socket.data = socket.data || {};
      socket.data.joinedEventId = eventId;

      try {
        // Cargar modelos de manera perezosa para evitar dependencias circulares
        const LiveEventMetrics = require('./models/LiveEventMetrics');
        const LiveEvent = require('./models/LiveEvent');

        // Obtener tamaño actual de la sala (número de espectadores concurrentes)
        const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
        const currentViewers = room ? room.size : 1; // incluir al espectador actual

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
          // Formula: (prevAvg * prevDuration + currentViewers) / (prevDuration + 1)
          newAvgConcurrent = ((prevAvg * prevDuration) + currentViewers) / (prevDuration + 1);
        } else {
          newAvgConcurrent = currentViewers;
        }

        // Construir objeto de actualización
        const update = {
          $inc: { uniqueViewers: 1 },
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
              const viewersNow = roomNow ? roomNow.size : 0;
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

  socket.on('disconnect', async () => {
    console.log('Cliente Socket.IO desconectado:', socket.id);
    const eventId = socket.data?.joinedEventId;
    if (!eventId) return;

    // Obtenemos la sala y el número actual de espectadores tras la desconexión
    const room = io.sockets.adapter.rooms.get(`event_${eventId}`);
    const currentViewers = room ? room.size : 0;

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
