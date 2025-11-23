const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { LiveEvent, User, LiveEventMetrics, LiveEventProductMetrics } = require('../models');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const LiveEventViewerSnapshot = require('../models/LiveEventViewerSnapshot');

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

        // Asegurarse de que el usuario autenticado tiene el tipo "influencer" (el middleware debería manejarlo, pero se verifica por seguridad)
    const user = await User.findById(req.user._id);
    if (!user || !user.userType?.includes('influencer')) {
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

// Obtener resumen de campañas con ingresos
exports.getCampaignSummary = async (req, res) => {
  try {
    const { range = '30d', platform } = req.query;
    const { start } = rangeToStart(range);
    const userId = req.user._id;

    const platformFilter = platform && platform !== 'all' ? { 'socialAccounts.platform': platform } : {};

    // Buscar eventos del usuario dentro del rango que estén vinculados a campañas
    const events = await LiveEvent.find({
      owner: userId,
      startDateTime: { $gte: start },
      campaign: { $ne: null },
      ...platformFilter,
    }).select('_id campaign');

    if (!events.length) {
      return res.json({ success: true, data: [] });
    }

    const eventIds = events.map(e => e._id);
    const campaignMap = new Map(events.map(e => [e._id.toString(), e.campaign]));

    // Obtener métricas de eventos
    const metrics = await LiveEventMetrics.find({ event: { $in: eventIds } }).select('event revenue salesAmount');

    // Agrupar ingresos por campaña
    const revenueByCampaign = new Map();
    metrics.forEach(m => {
      const campaignId = campaignMap.get((m.event || '').toString());
      if (!campaignId) return;
      const existing = revenueByCampaign.get(campaignId.toString()) || 0;
      revenueByCampaign.set(campaignId.toString(), existing + Number(m.revenue || m.salesAmount || 0));
    });

    const campaignIds = Array.from(revenueByCampaign.keys());
    const Campaign = require('../models/Campaign');
    const campaigns = await Campaign.find({ _id: { $in: campaignIds } }).select('name milestones');

    const result = campaigns.map(c => {
      const milestones = c.milestones || [];
      const completed = milestones.filter(m => m.completedAt).length; // completedAt puede no existir
      return {
        campaignId: c._id,
        name: c.name,
        revenue: revenueByCampaign.get(c._id.toString()) || 0,
        milestonesCompleted: completed,
        milestonesTotal: milestones.length,
      };
    });

    // Incluir campañas que no se encuentren en la consulta Campaign (poco probable)
    revenueByCampaign.forEach((rev, id) => {
      if (!result.find(r => r.campaignId.toString() === id)) {
        result.push({ campaignId: id, name: 'Campaña', revenue: rev, milestonesCompleted: 0, milestonesTotal: 0 });
      }
    });

    // Ordenar por ingresos desc
    result.sort((a, b) => b.revenue - a.revenue);

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error obteniendo resumen de campañas', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener eventos del influencer autenticado
exports.getLiveEvents = async (req, res) => {
  try {
    const user = req.user;
    const events = await LiveEvent
      .find({ owner: user._id })
      .populate('products')
      .populate({ path: 'campaign', select: '_id name kpis' })
      .sort({ startDateTime: 1 });
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

      // Emitir notificación y persistir historial
      try {
        const io = req.app.get('io');
        const prodDoc = await require('../models/Products').findById(productId).select('name');
        await NotificationService.emitAndPersist(io, {
          users: [event.owner],
          type: NotificationTypes.LIVE_HIGHLIGHT,
          title: 'Producto Destacado',
          message: 'Se ha destacado un nuevo producto en el evento.',
          entity: event._id,
          data: { eventId: event._id, productId, highlighted: true, eventTitle: event.title || '', productName: prodDoc?.name || '' },
        });
      } catch (emitErr) {
        console.warn('Error emitiendo highlight notification', emitErr.message);
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
    const { title, description, date, time, status, products, socialAccounts, youtubeVideoId, campaign } = req.body;

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

    // Manejar cambio de estado y monitoreo de YouTube
    if (status && status !== event.status) {
      const previousStatus = event.status;

      // Iniciar monitoreo de YouTube cuando el evento entra en vivo
      if (status === 'live' && previousStatus !== 'live') {
        try {
          const YoutubeMonitor = require('../services/youtube.monitor');
          if (event.youtubeVideoId) {
            YoutubeMonitor.start(event._id.toString(), event.youtubeVideoId);
          }
        } catch (err) {
          console.error('[LiveEventController] Error iniciando YoutubeMonitor', err);
        }
      }

      // Detener monitoreo de YouTube y cerrar highlight cuando el evento finaliza
      if (status === 'finished' && previousStatus !== 'finished') {
        try {
          const YoutubeMonitor = require('../services/youtube.monitor');
          YoutubeMonitor.stop(event._id.toString());
        } catch (err) {
          console.error('[LiveEventController] Error deteniendo YoutubeMonitor', err);
        }

        if (event.currentHighlightedProduct) {
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
      .populate({ path: 'campaign', select: '_id name kpis' })
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

    let event = await LiveEvent
      .findOne(query)
      .populate('products')
      .populate({ path: 'campaign', select: '_id name kpis' });

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

    // Permitir buscar por ObjectId o slug
    let eventId = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const evt = await LiveEvent.findOne({ slug: id }).select('_id');
      if (!evt) {
        return res.status(404).json({ success: false, message: 'Evento no encontrado' });
      }
      eventId = evt._id;
    }

    // Obtener métricas base
    const metrics = await LiveEventMetrics.findOne({ event: eventId });
    if (!metrics) {
      return res.status(404).json({ success: false, message: 'Métricas no encontradas' });
    }

    // Preparar payload de respuesta
    const responsePayload = { metrics };

    // Verificar si el evento está vinculado a una campaña para incluir objetivos
    try {
      const liveEvent = await LiveEvent.findById(id).select('campaign');
      if (liveEvent && liveEvent.campaign) {
        const Campaign = require('../models/Campaign');
        const campaign = await Campaign.findById(liveEvent.campaign).lean();
        if (campaign) {
          // Incluir KPIs y milestones
          responsePayload.campaign = {
            _id: campaign._id,
            name: campaign.name,
            kpis: campaign.kpis,
            milestones: campaign.milestones,
          };

          // Calcular progreso rápido por KPI (porcentaje 0-100)
          const kpiMapping = {
            viewers: 'uniqueViewers',
            clicks: 'productClicks',
            sales: 'purchases',
            addtocart: 'cartAdds',
            ctr: 'ctr',
            revenue: 'revenue',
          };
          const kpiProgress = {};
          for (const [kpiKey, { selected, target }] of Object.entries(campaign.kpis || {})) {
            if (!selected) continue;
            const metricField = kpiMapping[kpiKey];
            const currentVal = metricField ? metrics[metricField] || 0 : 0;
            const pct = target > 0 ? Math.min(100, Math.round((currentVal / target) * 100)) : 0;
            kpiProgress[kpiKey] = {
              target,
              current: currentVal,
              progress: pct,
            };
          }
          responsePayload.kpiProgress = kpiProgress;
        }
      }
    } catch (campErr) {
      console.warn('No se pudo obtener datos de campaña para métricas', campErr.message);
    }

    res.json({ success: true, data: responsePayload });
  } catch (error) {
    console.error('Error obteniendo métricas', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Actualizar métricas (incremental)
exports.getProductMetrics = async (req, res) => {
  try {
    const { id } = req.params;

    // Permitir buscar por ObjectId o slug
    let eventId = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const evt = await LiveEvent.findOne({ slug: id }).select('_id');
      if (!evt) {
        return res.status(404).json({ success: false, message: 'Evento no encontrado' });
      }
      eventId = evt._id;
    }

    const metrics = await require('../models/LiveEventProductMetrics')
      .find({ event: eventId })
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

    // Permitir buscar por ObjectId o slug
    let eventId = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const evt = await LiveEvent.findOne({ slug: id }).select('_id');
      if (!evt) {
        return res.status(404).json({ success: false, message: 'Evento no encontrado' });
      }
      eventId = evt._id;
    }

    const {
      uniqueViewers = 0,
      productClicks = 0,
      cartAdds = 0,
      purchases = 0,
      directSales = 0,
      views = 0,
      salesAmount = 0,
      likes = 0,
      shares = 0,
      peakViewers,
      avgConcurrentViewers,
      durationSeconds,
      comments = 0,
      newFollowers,
      productId,
    } = req.body;

    // Construir objeto de actualización dinámicamente
    const update = {};

    // Incrementos acumulativos
    const incFields = {
  uniqueViewers: Number(uniqueViewers),
  views: Number(views),
  productClicks: Number(productClicks),
  cartAdds: Number(cartAdds),
  purchases: Number(purchases),
  directSales: Number(directSales),
  salesAmount: Number(salesAmount),
  likes: Number(likes),
  shares: Number(shares),
  comments: Number(comments),
};
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

    if (newFollowers !== undefined) {
      update.$set = { ...(update.$set || {}), newFollowers };
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
    const metrics = await LiveEventMetrics.findOneAndUpdate({ event: eventId }, update, {
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

    // === Calcular métricas derivadas (CTR, revenue) ===
    try {
      if (metrics) {
        // CTR = productClicks / uniqueViewers (evitar división por cero)
        const totalViews = metrics.uniqueViewers || 0;
        const totalClicks = metrics.productClicks || 0;
        const ctr = totalViews > 0 ? parseFloat(((totalClicks / totalViews) * 100).toFixed(2)) : 0;
        const revenue = metrics.salesAmount || 0; // Alias para claridad en frontend

        // Solo actualizar si cambió para evitar escrituras innecesarias
        if (metrics.ctr !== ctr || metrics.revenue !== revenue) {
          metrics.ctr = ctr;
          metrics.revenue = revenue;
          await metrics.save();
        }
      }
    } catch (calcErr) {
      console.error('Error calculando CTR/Revenues', calcErr);
    }

    // === Preparar feed de actividad ===
    const newActivityEntries = [];
    const nowTs = new Date();
    const activityMap = {
      uniqueViewers: { type: 'viewer', label: 'nuevo(s) espectador(es)' },
      productClicks: { type: 'click', label: 'click(s) en producto' },
      cartAdds: { type: 'cartAdd', label: 'producto(s) añadido(s) al carrito' },
      purchases: { type: 'sale', label: 'venta(s) realizada(s)' },
      comments: { type: 'comment', label: 'comentario(s)' },
      newFollowers: { type: 'follower', label: 'nuevo(s) seguidor(es)' },
    };

    Object.entries(incFields).forEach(([key, val]) => {
      if (val && val !== 0 && activityMap[key]) {
        newActivityEntries.push({
          type: activityMap[key].type,
          message: `${val} ${activityMap[key].label}`,
          ts: nowTs,
        });
      }
    });

    if (newActivityEntries.length > 0) {
      try {
        await LiveEventMetrics.updateOne(
          { _id: metrics._id },
          {
            $push: {
              activityFeed: { $each: newActivityEntries, $position: 0, $slice: 50 },
            },
          }
        );
        // Reflect in returned object for the response/socket
        metrics.activityFeed = [
          ...newActivityEntries,
          ...(metrics.activityFeed || []),
        ].slice(0, 50);
      } catch (feedErr) {
        console.error('Error actualizando activityFeed', feedErr);
      }
    }

    // Emitir evento a través de Socket.IO para actualizar en tiempo real
    try {
      const io = req.app.get('io');
      if (io) {
        // Emitir a sala específica del evento para limitar audiencia
        io.to(`event_${id}`).emit('metricsUpdate', { eventId: id, metrics });
        // Compatibilidad legacy
        io.to(`event_${id}`).emit('metricsUpdated', { eventId: id, metrics });

        // Emitir feed de actividad recién generado
        if (newActivityEntries.length > 0) {
          io.to(`event_${id}`).emit('activityEvent', {
            eventId: id,
            events: newActivityEntries,
          });
        }

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
      console.warn('No se pudo emitir metricsUpdate/activityEvent/productMetricsUpdated via Socket.IO', e.message);
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

function rangeToStart(range) {
  const now = new Date();
  const map = { '7d': 7, '30d': 30, '60d': 60, '90d': 90, '1y': 365, '365d': 365 };
  const days = map[range] || 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, days };
}

exports.getAggregatedSummary = async (req, res) => {
  try {
    const { range = '30d', platform } = req.query;
    const { start, days } = rangeToStart(range);
    const userId = req.user._id;

    const platformFilter = platform && platform !== 'all' ? { 'socialAccounts.platform': platform } : {};
    const events = await LiveEvent.find({ owner: userId, startDateTime: { $gte: start }, ...platformFilter }).select('_id status startDateTime');
    const eventIds = events.map(e => e._id);
    const metrics = await LiveEventMetrics.find({ event: { $in: eventIds } });

    const livesEmitted = events.length;
    let durationSeconds = 0;
    let peakViewers = 0;
    let avgConcurrentSum = 0;
    let avgConcurrentWeight = 0;
    let uniqueViewers = 0;
    let views = 0;
    let productClicks = 0;
    let cartAdds = 0;
    let purchases = 0;
    let revenue = 0;
    let comments = 0;
    let newFollowers = 0;

    metrics.forEach(m => {
      durationSeconds += Number(m.durationSeconds || 0);
      peakViewers = Math.max(peakViewers, Number(m.peakViewers || 0));
      avgConcurrentSum += Number(m.avgConcurrentViewers || 0) * Number(m.durationSeconds || 0);
      avgConcurrentWeight += Number(m.durationSeconds || 0);
      uniqueViewers += Number(m.uniqueViewers || 0);
      views += Number(m.views || 0);
      productClicks += Number(m.productClicks || 0);
      cartAdds += Number(m.cartAdds || 0);
      purchases += Number(m.purchases || 0);
      revenue += Number(m.revenue || m.salesAmount || 0);
      comments += Number(m.comments || 0);
      newFollowers += Number(m.newFollowers || 0);
    });

    const avgConcurrentViewers = avgConcurrentWeight > 0 ? Math.round(avgConcurrentSum / avgConcurrentWeight) : 0;
    const ctrBase = views > 0 ? views : uniqueViewers;
    const ctr = ctrBase > 0 ? +(productClicks * 100 / ctrBase).toFixed(2) : 0;

    const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
    const prevEvents = await LiveEvent.find({ owner: userId, startDateTime: { $gte: prevStart, $lt: start }, ...platformFilter }).select('_id');
    const prevIds = prevEvents.map(e => e._id);
    const prevMetrics = await LiveEventMetrics.find({ event: { $in: prevIds } });

    const sumPrev = prevMetrics.reduce((acc, m) => {
      acc.durationSeconds += Number(m.durationSeconds || 0);
      acc.uniqueViewers += Number(m.uniqueViewers || 0);
      acc.views += Number(m.views || 0);
      acc.productClicks += Number(m.productClicks || 0);
      acc.cartAdds += Number(m.cartAdds || 0);
      acc.purchases += Number(m.purchases || 0);
      acc.revenue += Number(m.revenue || m.salesAmount || 0);
      acc.comments += Number(m.comments || 0);
      acc.newFollowers += Number(m.newFollowers || 0);
      return acc;
    }, { durationSeconds: 0, uniqueViewers: 0, views: 0, productClicks: 0, cartAdds: 0, purchases: 0, revenue: 0, comments: 0, newFollowers: 0 });

    function trend(curr, prev) {
      if (!prev || prev === 0) return 0;
      return +(((curr - prev) / prev) * 100).toFixed(2);
    }

    const data = {
      livesEmitted,
      durationSeconds,
      peakViewers,
      avgConcurrentViewers,
      ctr,
      uniqueViewers,
      productClicks,
      cartAdds,
      purchases,
      revenue,
      comments,
      newFollowers,
      trends: {
        durationSeconds: trend(durationSeconds, sumPrev.durationSeconds),
        uniqueViewers: trend(uniqueViewers, sumPrev.uniqueViewers),
        productClicks: trend(productClicks, sumPrev.productClicks),
        cartAdds: trend(cartAdds, sumPrev.cartAdds),
        purchases: trend(purchases, sumPrev.purchases),
        revenue: trend(revenue, sumPrev.revenue),
        comments: trend(comments, sumPrev.comments),
        newFollowers: trend(newFollowers, sumPrev.newFollowers),
      }
    };

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error agregando summary', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.getAggregatedFunnel = async (req, res) => {
  try {
    const { range = '30d', platform } = req.query;
    const { start } = rangeToStart(range);
    const userId = req.user._id;
    const platformFilter = platform && platform !== 'all' ? { 'socialAccounts.platform': platform } : {};
    const events = await LiveEvent.find({ owner: userId, startDateTime: { $gte: start }, ...platformFilter }).select('_id');
    const eventIds = events.map(e => e._id);
    const metrics = await LiveEventMetrics.find({ event: { $in: eventIds } });
    const LiveEventProductMetrics = require('../models/LiveEventProductMetrics');
    const productMetrics = await LiveEventProductMetrics.find({ event: { $in: eventIds } });

    let uniqueViewers = 0;
    let clicks = 0;
    let cartAdds = 0;
    let purchases = 0;
    metrics.forEach(m => {
      uniqueViewers += Number(m.uniqueViewers || 0);
      clicks += Number(m.productClicks || 0);
    });
    productMetrics.forEach(pm => {
      cartAdds += Number(pm.cartAdds || 0);
      purchases += Number(pm.purchases || 0);
    });

    const rates = {
      viewersToClicks: uniqueViewers > 0 ? +(clicks * 100 / uniqueViewers).toFixed(2) : 0,
      clicksToCartAdds: clicks > 0 ? +(cartAdds * 100 / clicks).toFixed(2) : 0,
      cartToPurchases: cartAdds > 0 ? +(purchases * 100 / cartAdds).toFixed(2) : 0,
      overall: uniqueViewers > 0 ? +(purchases * 100 / uniqueViewers).toFixed(2) : 0,
    };

    return res.json({ success: true, data: { uniqueViewers, clicks, cartAdds, purchases, rates } });
  } catch (error) {
    console.error('Error agregando funnel', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.getAggregatedAudienceSeries = async (req, res) => {
  try {
    const { range = '30d', groupBy = 'day', platform } = req.query;
    const { start } = rangeToStart(range);
    const userId = req.user._id;
    const platformFilter = platform && platform !== 'all' ? { 'socialAccounts.platform': platform } : {};
    const events = await LiveEvent.find({ owner: userId, startDateTime: { $gte: start }, ...platformFilter }).select('_id startDateTime');
    const eventIds = events.map(e => e._id);

    const match = { event: { $in: eventIds }, timestamp: { $gte: start } };

    if (groupBy === 'event') {
      const series = await LiveEventViewerSnapshot.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$event",
            avgViewers: { $avg: "$viewersCount" },
            maxViewers: { $max: "$viewersCount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const startMap = new Map(events.map(e => [e._id.toString(), e.startDateTime]));
      const normalized = series.map(s => ({
        timestamp: startMap.get((s._id || '').toString()) || start,
        avgViewers: s.avgViewers || 0,
        maxViewers: s.maxViewers || 0,
      }));
      return res.json({ success: true, data: normalized });
    } else {
      const bucketSizeMs = groupBy === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
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
        { $project: { _id: 0, timestamp: "$_id", avgViewers: 1, maxViewers: 1 } },
      ]);
      return res.json({ success: true, data: series });
    }
  } catch (error) {
    console.error('Error agregando audiencia', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};
