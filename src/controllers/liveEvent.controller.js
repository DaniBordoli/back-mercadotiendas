const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { LiveEvent, User, LiveEventMetrics, LiveEventProductMetrics } = require('../models');

/**
 * Crear un nuevo evento en vivo
 * Acceso: Influencer autenticado
 */
exports.createLiveEvent = async (req, res) => {
  try {
    // Validar campos con express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // In createLiveEvent, after destructuring req.body
    const { title, description, date, time, status, products = [], socialAccounts = [], youtubeVideoId, campaign } = req.body;

    // Combinar fecha y hora en un solo Date ISO
    const startDateTime = new Date(`${date}T${time}:00Z`);

    // Validar que la fecha no esté en el pasado
    if (startDateTime < new Date()) {
      return res.status(400).json({ success: false, message: 'La fecha y hora no pueden estar en el pasado' });
    }

    // Asegurarse que el user es influencer, aunque el middleware debería manejarlo
    const user = await User.findById(req.user._id);
    if (!user || !user.isInfluencer) {
      return res.status(403).json({ success: false, message: 'Solo los influencers pueden crear eventos en vivo' });
    }

    const liveEvent = new LiveEvent({
      title,
      description,
      startDateTime,
      status: status || 'draft',
      owner: user._id,
      products,
      socialAccounts,
      campaign,
      youtubeVideoId,
    });

    await liveEvent.save();
    // Crear documento de métricas vacío asociado al evento
    try {
      await LiveEventMetrics.create({ event: liveEvent._id });
    } catch (metricsErr) {
      console.error('Error creando métricas para el evento', metricsErr);
    }
    res.status(201).json({ success: true, data: liveEvent, message: 'Evento en vivo creado con éxito' });
  } catch (error) {
    console.error('Error al crear evento en vivo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener eventos del influencer autenticado
exports.getLiveEvents = async (req, res) => {
  try {
    const user = req.user;
    const events = await LiveEvent.find({ owner: user._id }).populate('products').sort({ startDateTime: 1 });
    res.json(events);
  } catch (error) {
    console.error('Error fetching live events:', error);
    res.status(500).json({ message: 'Error al obtener eventos' });
  }
};

// Eliminar evento en vivo del influencer autenticado
// Actualizar producto destacado del evento y manejar tiempo destacado
exports.updateHighlightedProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId es requerido' });
    }

    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const eventQuery = isValidObjectId ? { _id: id } : { slug: id };
    eventQuery.owner = req.user._id;

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // Obtener evento con bloqueo de escritura para coherencia
      const event = await LiveEvent.findOne(eventQuery).session(session);
      if (!event) {
        throw new Error('Evento no encontrado');
      }

      // Validar que el producto pertenece al evento
      if (!event.products.some(p => p.equals ? p.equals(productId) : p.toString() === productId)) {
        throw new Error('El producto no pertenece al evento');
      }

      const now = new Date();

      // Si había un producto destacado previamente, actualizar su tiempoHighlighted
      if (event.currentHighlightedProduct) {
        const elapsedMs = now - (event.highlightStartedAt || now);
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        if (elapsedSeconds > 0) {
          await LiveEventProductMetrics.findOneAndUpdate(
            { event: event._id, product: event.currentHighlightedProduct },
            { $inc: { timeHighlighted: elapsedSeconds } },
            { upsert: true, new: true, session }
          );
        }
      }

      // Actualizar event con nuevo highlight
      event.currentHighlightedProduct = productId;
      event.highlightStartedAt = now;
      // Mantener compatibilidad con propiedad legacy highlightedProduct
      event.highlightedProduct = productId;
      await event.save({ session });

      // Emitir evento Socket.IO
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`event_${event._id}`).emit('highlightChanged', {
            eventId: event._id,
            productId,
          });
        }
      } catch (emitErr) {
        console.warn('No se pudo emitir highlightChanged', emitErr.message);
      }

      res.json({ success: true, highlightedProduct: productId });
    });
    await session.endSession();
  } catch (error) {
    console.error('Error actualizando producto destacado', error);
    res.status(500).json({ success: false, message: error.message || 'Error interno del servidor' });
  }
};

// Obtener producto destacado del evento (público)
exports.getHighlightedProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Determinar si id es ObjectId o slug
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const event = isValidObjectId
      ? await LiveEvent.findById(id).select('highlightedProduct')
      : await LiveEvent.findOne({ slug: id }).select('highlightedProduct');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }
    res.json({ success: true, highlightedProduct: event.highlightedProduct });
  } catch (error) {
    console.error('Error obteniendo producto destacado', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.deleteLiveEvent = async (req, res) => {
  try {
    const { id } = req.params;
    // Solo permitir eliminar eventos pertenecientes al usuario autenticado
    const deleted = await LiveEvent.findOneAndDelete({ _id: id, owner: req.user._id });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    res.json({ success: true, message: 'Evento eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar evento en vivo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Actualizar un evento en vivo (influencer autenticado)
exports.updateLiveEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, time, status, products, socialAccounts, youtubeVideoId } = req.body;

    // Encontrar evento perteneciente al usuario
    const event = await LiveEvent.findOne({ _id: id, owner: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    if (title !== undefined) event.title = title;
    if (description !== undefined) event.description = description;
    if (date && time) {
      event.startDateTime = new Date(`${date}T${time}:00Z`);
    }
    if (status !== undefined) event.status = status;

    // Si el evento se marca como finalizado y hay un producto actualmente destacado, cerrar su tiempo
    if (status === 'finished' && event.currentHighlightedProduct) {
      const now = new Date();
      const elapsedMs = now - (event.highlightStartedAt || now);
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      if (elapsedSeconds > 0) {
        await LiveEventProductMetrics.findOneAndUpdate(
          { event: event._id, product: event.currentHighlightedProduct },
          { $inc: { timeHighlighted: elapsedSeconds } },
          { upsert: true, new: true }
        );
      }
      event.currentHighlightedProduct = null;
      event.highlightStartedAt = null;

      // Emitir highlightChanged con null
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`event_${event._id}`).emit('highlightChanged', {
            eventId: event._id,
            productId: null,
          });
        }
      } catch (e) {
        console.warn('No se pudo emitir highlightChanged al finalizar live', e.message);
      }
    }
    if (products !== undefined) event.products = products;
    if (socialAccounts !== undefined) event.socialAccounts = socialAccounts;
    if (campaign !== undefined) event.campaign = campaign;
    if (youtubeVideoId !== undefined) event.youtubeVideoId = youtubeVideoId;

    await event.save();
    res.json({ success: true, data: event, message: 'Evento actualizado con éxito' });
  } catch (error) {
    console.error('Error al actualizar evento en vivo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener eventos publicados (público)
exports.getPublicLiveEvents = async (req, res) => {
  try {
    const events = await LiveEvent.find({ status: { $in: ['published', 'live'] } })
      .populate({ path: 'owner', select: 'name fullName avatar' })
      .populate('products')
      .sort({ startDateTime: -1 });

    res.json(events);
  } catch (error) {
    console.error('Error obteniendo eventos públicos en vivo:', error);
    res.status(500).json({ message: 'Error al obtener eventos públicos' });
  }
};

// Obtener un solo evento en vivo (influencer autenticado)
exports.getLiveEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    // Si es influencer autenticado, puede ver solamente sus propios eventos; de lo contrario devolver 403
    const query = isValidObjectId ? { _id: id } : { slug: id };
    if (req.user) {
      // Si hay usuario autenticado, aseguramos que sea dueño del evento o influencer
      query.owner = req.user._id;
    }

    let event = await LiveEvent.findOne(query).populate('products');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    // Asegurar que la primera cuenta social coincida con la plataforma principal, si esta existe
    if (event.platform && Array.isArray(event.socialAccounts) && event.socialAccounts.length > 1) {
      const idx = event.socialAccounts.findIndex(sa => sa.platform?.toLowerCase() === event.platform.toLowerCase());
      if (idx > 0) {
        // Mover esa cuenta al inicio del arreglo
        const [matching] = event.socialAccounts.splice(idx, 1);
        event.socialAccounts.unshift(matching);
      }
    }

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Error obteniendo evento en vivo:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener métricas de un evento en vivo
exports.getMetrics = async (req, res) => {
  try {
    const { id } = req.params;
    const metrics = await LiveEventMetrics.findOne({ event: id });
    if (!metrics) {
      return res.status(404).json({ success: false, message: 'Métricas no encontradas' });
    }
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error obteniendo métricas', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Actualizar métricas (incremental)
exports.getProductMetrics = async (req, res) => {
  try {
    const { id } = req.params;

    const metrics = await require('../models/LiveEventProductMetrics')
      .find({ event: id })
      .populate('product', 'nombre precio productImages');

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error obteniendo métricas de productos', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.updateMetrics = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      uniqueViewers = 0,
      productClicks = 0,
      cartAdds = 0,
      purchases = 0,
      salesAmount = 0,
      likes = 0,
      shares = 0,
      // Nuevos campos
      peakViewers,
      avgConcurrentViewers,
      durationSeconds,
      productId,
    } = req.body;

    // Construir objeto de actualización dinámicamente
    const update = {};

    // Incrementos acumulativos
    const incFields = { uniqueViewers, productClicks, cartAdds, purchases, salesAmount, likes, shares };
    // Remover claves con incremento 0 para evitar crearlas innecesariamente
    Object.keys(incFields).forEach(key => {
      if (incFields[key] && incFields[key] !== 0) {
        update.$inc = { ...(update.$inc || {}), [key]: incFields[key] };
      }
    });

    // peakViewers se maneja como máximo histórico
    if (peakViewers !== undefined) {
      update.$max = { ...(update.$max || {}), peakViewers };
    }

    // avgConcurrentViewers y durationSeconds se actualizan con $set (último valor conocido)
    if (avgConcurrentViewers !== undefined) {
      update.$set = { ...(update.$set || {}), avgConcurrentViewers };
    }

    // Si durationSeconds viene explícito en el payload, lo usamos; de lo contrario, lo calculamos a partir de la hora de inicio del evento
    let finalDurationSeconds = durationSeconds;
    if (finalDurationSeconds === undefined) {
      try {
        const liveEvent = await LiveEvent.findById(id).select('startDateTime status updatedAt');
        if (liveEvent && liveEvent.startDateTime) {
          const endTime = liveEvent.status === 'finished' && liveEvent.updatedAt ? liveEvent.updatedAt : new Date();
          const diffMs = endTime.getTime() - new Date(liveEvent.startDateTime).getTime();
          if (!Number.isNaN(diffMs) && diffMs >= 0) {
            finalDurationSeconds = Math.floor(diffMs / 1000);
          }
        }
      } catch (dErr) {
        console.warn('No se pudo calcular durationSeconds automáticamente', dErr.message);
      }
    }

    if (finalDurationSeconds !== undefined) {
      update.$set = { ...(update.$set || {}), durationSeconds: finalDurationSeconds };
    }

    // Actualizar métricas globales del evento
    const metrics = await LiveEventMetrics.findOneAndUpdate({ event: id }, update, {
      new: true,
      upsert: true,
    });

    // Si se proporciona productId, registrar también en métricas por producto
    let updatedProductMetrics = null;
    if (productId && (cartAdds > 0 || productClicks > 0)) {
      try {
        const productInc = {};
        if (cartAdds > 0) productInc.cartAdds = cartAdds;
        if (productClicks > 0) productInc.clicks = productClicks;
        if (Object.keys(productInc).length > 0) {
          updatedProductMetrics = await LiveEventProductMetrics.findOneAndUpdate(
            { event: id, product: productId },
            { $inc: productInc },
            { new: true, upsert: true }
          );
        }
      } catch (pmErr) {
        console.error('Error actualizando cartAdds en LiveEventProductMetrics', pmErr);
      }
    }

    // Emitir evento a través de Socket.IO para actualizar en tiempo real
    try {
      const io = req.app.get('io');
      if (io) {
        // Emitir a sala específica del evento para limitar audiencia
        io.to(`event_${id}`).emit('metricsUpdated', { eventId: id, metrics });

        // Si se actualizó métricas por producto, emitir evento correspondiente
        if (updatedProductMetrics) {
          const productMetrics = await LiveEventProductMetrics.find({ event: id }).populate(
            'product',
            'nombre precio productImages'
          );
          io.to(`event_${id}`).emit('productMetricsUpdated', { eventId: id, productMetrics });
        }
      }
    } catch (e) {
      console.warn('No se pudo emitir metricsUpdated/productMetricsUpdated via Socket.IO', e.message);
    }

    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error actualizando métricas', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// ========================= NUEVO =========================
// Registrar snapshot de espectadores concurrentes
// POST /api/live-events/:id/viewers-snapshot
// Body: { viewersCount: number }
exports.createViewerSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const { viewersCount } = req.body;

    if (viewersCount === undefined || Number.isNaN(Number(viewersCount))) {
      return res.status(400).json({ success: false, message: 'viewersCount es requerido y debe ser numérico' });
    }

    // Verificar que el evento exista (opcional: podría omitirse para ahorrar consulta)
    const eventExists = await LiveEvent.exists({ _id: id });
    if (!eventExists) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    const LiveEventViewerSnapshot = require('../models/LiveEventViewerSnapshot');

    const snapshot = await LiveEventViewerSnapshot.create({
      event: id,
      viewersCount: Number(viewersCount),
      timestamp: new Date(),
    });

    // Emitir actualización en tiempo real (opcional)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`event_${id}`).emit('viewerCountUpdated', {
          eventId: id,
          viewersCount: snapshot.viewersCount,
          timestamp: snapshot.timestamp,
        });
      }
    } catch (e) {
      console.warn('No se pudo emitir viewerCountUpdated', e.message);
    }

    return res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Error creando viewer snapshot', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener serie de espectadores agregados por intervalo (default 60s)
// GET /api/live-events/:id/viewer-series?from=ISO&to=ISO&interval=60
exports.getViewerSeries = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, interval = 60 } = req.query; // interval en segundos

    const LiveEventViewerSnapshot = require('../models/LiveEventViewerSnapshot');

    const match = { event: id };
    if (from) {
      match.timestamp = { ...match.timestamp, $gte: new Date(from) };
    }
    if (to) {
      match.timestamp = { ...match.timestamp, $lte: new Date(to) };
    }

    const bucketSizeMs = Number(interval) * 1000;

    const series = await LiveEventViewerSnapshot.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: "$timestamp" },
                { $mod: [{ $toLong: "$timestamp" }, bucketSizeMs] },
              ],
            },
          },
          avgViewers: { $avg: "$viewersCount" },
          maxViewers: { $max: "$viewersCount" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: "$_id",
          avgViewers: 1,
          maxViewers: 1,
        },
      },
    ]);

    return res.json({ success: true, data: series });
  } catch (error) {
    console.error('Error obteniendo serie de viewers', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};