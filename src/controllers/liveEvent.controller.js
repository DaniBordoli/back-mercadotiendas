const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { LiveEvent, User, LiveEventMetrics, LiveEventProductMetrics, AuditLog } = require('../models');
const { ChatMessage } = require('../models');
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

    let startDateTime;
    try {
      const tzOffsetMinutes = Number(req.body.tzOffsetMinutes ?? NaN);
      if (!Number.isNaN(tzOffsetMinutes)) {
        const [y, m, d] = String(date).split('-').map((v) => parseInt(v));
        const [hh, mm] = String(time).split(':').map((v) => parseInt(v));
        const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
        startDateTime = new Date(utcMs + tzOffsetMinutes * 60000);
      } else {
        startDateTime = new Date(`${date}T${time}:00`);
      }
    } catch (_) {
      startDateTime = new Date(`${date}T${time}:00`);
    }

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

    // Obtener métricas de eventos y por producto
    const metrics = await LiveEventMetrics.find({ event: { $in: eventIds } }).select('event uniqueViewers productClicks purchases revenue salesAmount ctr');
    const LiveEventProductMetrics = require('../models/LiveEventProductMetrics');
    const productMetrics = await LiveEventProductMetrics.find({ event: { $in: eventIds } }).select('event cartAdds purchases revenue');

    // Agregados por campaña para KPIs y revenue
    const aggByCampaign = new Map();
    const ensureAgg = (cid) => {
      const k = cid.toString();
      if (!aggByCampaign.has(k)) {
        aggByCampaign.set(k, { uniqueViewers: 0, productClicks: 0, cartAdds: 0, purchases: 0, revenue: 0 });
      }
      return aggByCampaign.get(k);
    };
    metrics.forEach(m => {
      const campaignId = campaignMap.get((m.event || '').toString());
      if (!campaignId) return;
      const agg = ensureAgg(campaignId);
      agg.uniqueViewers += Number(m.uniqueViewers || 0);
      agg.productClicks += Number(m.productClicks || 0);
      agg.purchases += Number(m.purchases || 0);
      agg.revenue += Number(m.revenue || m.salesAmount || 0);
    });
    productMetrics.forEach(pm => {
      const campaignId = campaignMap.get((pm.event || '').toString());
      if (!campaignId) return;
      const agg = ensureAgg(campaignId);
      agg.cartAdds += Number(pm.cartAdds || 0);
      agg.purchases += Number(pm.purchases || 0);
      agg.revenue += Number(pm.revenue || 0);
    });

    const campaignIds = Array.from(aggByCampaign.keys());
    const Campaign = require('../models/Campaign');
    const campaigns = await Campaign
      .find({ _id: { $in: campaignIds } })
      .select('name milestones kpis status shop startDate endDate')
      .populate('shop', 'name');

    const result = campaigns.map(c => {
      const milestones = c.milestones || [];
      const completed = milestones.filter(m => m.completedAt).length; // completedAt puede no existir
      const kpisObj = c.kpis || {};
      const selectedKeys = Object.keys(kpisObj).filter(k => kpisObj[k]?.selected);
      const kpiMapping = { viewers: 'uniqueViewers', clicks: 'productClicks', sales: 'purchases', addtocart: 'cartAdds', ctr: 'ctr', revenue: 'revenue' };
      const agg = aggByCampaign.get(c._id.toString()) || { uniqueViewers: 0, productClicks: 0, cartAdds: 0, purchases: 0, revenue: 0 };
      const ctrBase = agg.uniqueViewers > 0 ? agg.uniqueViewers : 0;
      const ctrAgg = ctrBase > 0 ? +(agg.productClicks * 100 / ctrBase).toFixed(2) : 0;
      const currentByKey = {
        viewers: agg.uniqueViewers,
        clicks: agg.productClicks,
        sales: agg.purchases,
        addtocart: agg.cartAdds,
        ctr: ctrAgg,
        revenue: agg.revenue,
      };
      const kpisCompleted = selectedKeys.filter(k => {
        const target = Number(kpisObj[k]?.target || 0);
        const current = Number(currentByKey[k] || 0);
        return target > 0 ? current >= target : false;
      }).length;
      const isCompleted = selectedKeys.length > 0 ? (kpisCompleted === selectedKeys.length) : (completed > 0 && completed === milestones.length) || (c.status === 'closed');
      return {
        campaignId: c._id,
        name: c.name,
        startDate: c.startDate,
        endDate: c.endDate,
        revenue: agg.revenue || 0,
        milestonesCompleted: completed,
        milestonesTotal: milestones.length,
        kpisSelected: selectedKeys,
        kpisCompleted,
        status: c.status,
        brand: (c.shop && c.shop.name) || undefined,
        completed: !!isCompleted,
      };
    });

    // Incluir campañas que no se encuentren en la consulta Campaign (poco probable)
    aggByCampaign.forEach((agg, id) => {
      if (!result.find(r => r.campaignId.toString() === id)) {
        result.push({ campaignId: id, name: 'Campaña', revenue: agg.revenue || 0, milestonesCompleted: 0, milestonesTotal: 0, kpisSelected: [], kpisCompleted: 0, status: '-', completed: false });
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

      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`event_${event._id}`).emit('highlightChanged', {
            eventId: event._id,
            productId,
            highlighted: true,
          });
        }
      } catch (emitErr) {
        console.warn('Error emitiendo highlightChanged', emitErr.message);
      }

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

exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { before, limit = 50 } = req.query;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const event = isValidObjectId ? await LiveEvent.findById(id).select('_id') : await LiveEvent.findOne({ slug: id }).select('_id');
    if (!event) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    const query = { event: event._id, status: 'active' };
    if (before) query.createdAt = { $lt: new Date(before) };
    const msgs = await ChatMessage.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 100)).populate('user', 'name avatar');
    res.json({ success: true, data: msgs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.createChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};
    if (!content || String(content).trim().length === 0) return res.status(400).json({ success: false, message: 'Contenido requerido' });
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const event = isValidObjectId ? await LiveEvent.findById(id).select('_id owner') : await LiveEvent.findOne({ slug: id }).select('_id owner');
    if (!event) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    const msg = await ChatMessage.create({ event: event._id, user: req.user._id, content: String(content).slice(0, 500) });
    try {
      const io = req.app.get('io');
      if (io) {
        const populated = await ChatMessage.findById(msg._id).populate('user', 'name avatar');
        io.to(`event_${event._id}`).emit('chat:new', { eventId: event._id.toString(), message: populated });
        io.to(`event_${id}`).emit('chat:new', { eventId: String(id), message: populated });
      }
    } catch (_) {}
    try {
      await LiveEventMetrics.updateOne({ event: event._id }, { $inc: { comments: 1 } }, { upsert: true });
      const io = req.app.get('io');
      if (io) {
        const metricsDoc = await LiveEventMetrics.findOne({ event: event._id });
        io.to(`event_${event._id}`).emit('metricsUpdated', { eventId: event._id.toString(), metrics: metricsDoc });
      }
    } catch (_) {}
    res.json({ success: true, data: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.deleteChatMessage = async (req, res) => {
  try {
    const { id, messageId } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const event = isValidObjectId ? await LiveEvent.findById(id).select('_id owner') : await LiveEvent.findOne({ slug: id }).select('_id owner');
    if (!event) return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    if (String(event.owner) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const msg = await ChatMessage.findOne({ _id: messageId, event: event._id });
    if (!msg) return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
    msg.status = 'deleted';
    msg.deletedAt = new Date();
    msg.moderatedBy = req.user._id;
    await msg.save();
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = { eventId: event._id.toString(), messageId, message: { _id: msg._id.toString(), user: msg.user?.toString?.() || undefined, createdAt: msg.createdAt, status: msg.status } };
        io.to(`event_${event._id}`).emit('chat:deleted', payload);
        io.to(`event_${id}`).emit('chat:deleted', { ...payload, eventId: String(id) });
      }
    } catch (_) {}
    res.json({ success: true });
  } catch (error) {
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
      event.startDateTime = new Date(`${date}T${time}:00`);
    }

    // Manejar cambio de estado internamente antes de asignar
    if (status !== undefined) {
      const previousStatus = event.status;
      const nextStatus = status;

      if (nextStatus !== previousStatus) {
        
        if (nextStatus === 'live' && previousStatus !== 'live') {
          event.endedAt = null;
          event.startDateTime = new Date();
          try {
            const YoutubeMonitor = require('../services/youtube.monitor');
            if (event.youtubeVideoId) {
              YoutubeMonitor.start(event._id.toString(), event.youtubeVideoId);
            }
          } catch (err) {
            console.error('[LiveEventController] Error iniciando YoutubeMonitor', err);
          }
        }

        
        if (nextStatus === 'finished' && previousStatus !== 'finished') {
          event.endedAt = new Date();
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

      event.status = nextStatus;
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

exports.getLiveEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    const baseQuery = isValidObjectId ? { _id: id } : { slug: id };

    let event = await LiveEvent
      .findOne(baseQuery)
      .populate('products')
      .populate({ path: 'campaign', select: '_id name kpis' })
      .populate({
        path: 'owner',
        select: 'name fullName avatar influencerProfile followers',
        populate: { path: 'shop', select: 'name imageUrl followers' }
      });

    if (!event) {
      const allowedStatuses = ['published', 'live', 'finished'];
      event = await LiveEvent
        .findOne({ ...baseQuery, status: { $in: allowedStatuses } })
        .populate('products')
        .populate({ path: 'campaign', select: '_id name kpis' })
        .populate({
          path: 'owner',
          select: 'name fullName avatar influencerProfile followers',
          populate: { path: 'shop', select: 'name imageUrl followers' }
        });
      if (!event) {
        return res.status(404).json({ success: false, message: 'Evento no encontrado' });
      }
    }

    if (req.user && String(event.owner) !== String(req.user._id)) {
      const allowedStatuses = ['published', 'live', 'finished'];
      if (!allowedStatuses.includes(event.status)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
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

    try {
      const LiveEventViewerSnapshot = require('../models/LiveEventViewerSnapshot');
      const eventObjectId = mongoose.Types.ObjectId(eventId);
      const snaps = await LiveEventViewerSnapshot.aggregate([
        { $match: { event: eventObjectId } },
        {
          $group: {
            _id: null,
            avgViewers: { $avg: '$viewersCount' },
            maxViewers: { $max: '$viewersCount' },
          },
        },
      ]);
      const liveEventDoc = await LiveEvent.findById(eventId).select('startDateTime endedAt status updatedAt');
      const computedAvg = snaps && snaps.length > 0 ? Math.round(Number(snaps[0].avgViewers || 0)) : 0;
      const computedPeak = snaps && snaps.length > 0 ? Math.round(Number(snaps[0].maxViewers || 0)) : 0;
      let computedDuration = 0;
      if (liveEventDoc && liveEventDoc.startDateTime) {
        const fallbackEnd = liveEventDoc.status === 'finished' ? (liveEventDoc.updatedAt || new Date()) : new Date();
        const endTime = liveEventDoc.endedAt || fallbackEnd;
        const diffMs = endTime.getTime() - new Date(liveEventDoc.startDateTime).getTime();
        if (!Number.isNaN(diffMs) && diffMs >= 0) {
          computedDuration = Math.floor(diffMs / 1000);
        }
      }
      let needsSave = false;
      if (!metrics.avgConcurrentViewers || metrics.avgConcurrentViewers === 0) {
        metrics.avgConcurrentViewers = computedAvg;
        needsSave = true;
      }
      if (!metrics.peakViewers || metrics.peakViewers === 0) {
        metrics.peakViewers = computedPeak;
        needsSave = true;
      }
      if ((!metrics.durationSeconds || metrics.durationSeconds === 0) && computedDuration > 0) {
        metrics.durationSeconds = computedDuration;
        needsSave = true;
      }
      if (needsSave) {
        await metrics.save();
      }
    } catch (derErr) {
    }

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
      newFollowers: Number(newFollowers),
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

    // newFollowers se maneja como incremento acumulativo

    let finalDurationSeconds = durationSeconds;
    if (finalDurationSeconds === undefined) {
      try {
        const liveEvent = await LiveEvent.findById(id).select('startDateTime status endedAt updatedAt');
        if (liveEvent && liveEvent.startDateTime) {
          const fallbackEnd = liveEvent.status === 'finished' ? (liveEvent.updatedAt || new Date()) : new Date();
          const endTime = liveEvent.endedAt || fallbackEnd;
          const diffMs = endTime.getTime() - new Date(liveEvent.startDateTime).getTime();
          if (!Number.isNaN(diffMs) && diffMs >= 0) {
            finalDurationSeconds = Math.floor(diffMs / 1000);
          }
        }
      } catch (dErr) {
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

    try {
      const incNewFollowers = Number(incFields.newFollowers || 0);
      if (incNewFollowers > 0) {
        const evt = await LiveEvent.findById(id).select('owner');
        if (evt && evt.owner) {
          await User.updateOne({ _id: evt.owner }, { $inc: { followers: incNewFollowers } });
          try {
            const io = req.app.get('io');
            if (io) {
              io.to(`user_${evt.owner.toString()}`).emit('user:followersIncrement', { userId: evt.owner.toString(), amount: incNewFollowers, eventId: id });
            }
          } catch (emitErr) {}
        }
      }
    } catch (ufErr) {}

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
      likes: { type: 'other', label: 'me gusta' },
      shares: { type: 'other', label: 'compartido(s)' },
    };

    Object.entries(incFields).forEach(([key, val]) => {
      if (typeof val === 'number' && val > 0 && activityMap[key]) {
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

    let kpiProgressPayload = null;
    let campaignPayload = null;
    try {
      const liveEvent = await LiveEvent.findById(id).select('campaign');
      if (liveEvent && liveEvent.campaign) {
        const Campaign = require('../models/Campaign');
        const campaignDoc = await Campaign.findById(liveEvent.campaign);
        if (campaignDoc) {
          const kpiMapping = {
            viewers: 'uniqueViewers',
            clicks: 'productClicks',
            sales: 'purchases',
            addtocart: 'cartAdds',
            ctr: 'ctr',
            revenue: 'revenue',
          };
          const kpiLabels = {
            viewers: 'Espectadores',
            clicks: 'Clics',
            sales: 'Ventas',
            addtocart: 'Carritos',
            ctr: 'CTR',
            revenue: 'Ingresos',
          };
          const kpiProgress = {};
          for (const [kpiKey, cfg] of Object.entries(campaignDoc.kpis || {})) {
            if (!cfg || !cfg.selected) continue;
            const field = kpiMapping[kpiKey];
            const currentVal = field ? Number(metrics[field] || 0) : 0;
            const targetVal = Number(cfg.target || 0);
            const pct = targetVal > 0 ? Math.min(100, Math.round((currentVal / targetVal) * 100)) : 0;
            kpiProgress[kpiKey] = { target: targetVal, current: currentVal, progress: pct };

            const incFieldMap = {
              viewers: 'uniqueViewers',
              clicks: 'productClicks',
              sales: 'purchases',
              addtocart: 'cartAdds',
              revenue: 'salesAmount',
            };
            const incField = incFieldMap[kpiKey];
            const incChanged = incField ? Number((req.body || {})[incField] || 0) > 0 : false;
            const reached = targetVal > 0 && currentVal >= targetVal;
            if (incChanged && reached) {
              newActivityEntries.push({
                type: 'milestone',
                message: `Milestone alcanzado: ${kpiLabels[kpiKey]} ${currentVal}/${targetVal}`,
                ts: new Date(),
              });

              try {
                const idx = (campaignDoc.milestones || []).findIndex(m => m.kpiKey === kpiKey && !m.completedAt);
                if (idx > -1) {
                  campaignDoc.milestones[idx].completedAt = new Date();
                  await campaignDoc.save();
                }
              } catch (saveErr) {}
            }
          }
          // Si todos los milestones están completados, cerrar campaña
          try {
            const milestonesArr = campaignDoc.milestones || [];
            const allCompleted = milestonesArr.length > 0 && milestonesArr.every(m => !!m.completedAt);
            if (allCompleted && campaignDoc.status !== 'closed') {
              campaignDoc.status = 'closed';
              await campaignDoc.save();
            }
          } catch (e) {}
          kpiProgressPayload = kpiProgress;
          campaignPayload = {
            _id: campaignDoc._id,
            name: campaignDoc.name,
            status: campaignDoc.status,
            milestones: (campaignDoc.milestones || []).map(m => ({
              name: m.name,
              description: m.description,
              date: m.date,
              kpiKey: m.kpiKey,
              completedAt: m.completedAt
            }))
          };
        }
      }
    } catch (e) {}

    // Emitir evento a través de Socket.IO para actualizar en tiempo real
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`event_${id}`).emit('metricsUpdate', { eventId: id, metrics, kpiProgress: kpiProgressPayload, campaign: campaignPayload });
        io.to(`event_${id}`).emit('metricsUpdated', { eventId: id, metrics, kpiProgress: kpiProgressPayload, campaign: campaignPayload });

        
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

    // Permitir buscar por ObjectId o slug
    let eventId = id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const evt = await LiveEvent.findOne({ slug: id }).select('_id');
      if (!evt) {
        return res.status(404).json({ success: false, message: 'Evento no encontrado' });
      }
      eventId = evt._id;
    }

    const match = { event: eventId };
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
    const LiveEventProductMetrics = require('../models/LiveEventProductMetrics');
    const productMetricsCurr = await LiveEventProductMetrics.find({ event: { $in: eventIds } });

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
      revenue += Number(m.revenue || m.salesAmount || 0);
      comments += Number(m.comments || 0);
      newFollowers += Number(m.newFollowers || 0);
    });

    productMetricsCurr.forEach(pm => {
      cartAdds += Number(pm.cartAdds || 0);
      purchases += Number(pm.purchases || 0);
      revenue += Number(pm.revenue || 0);
    });

    const avgConcurrentViewers = avgConcurrentWeight > 0 ? Math.round(avgConcurrentSum / avgConcurrentWeight) : 0;
    const ctrBase = views > 0 ? views : uniqueViewers;
    const ctr = ctrBase > 0 ? +(productClicks * 100 / ctrBase).toFixed(2) : 0;

    const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
    const prevEvents = await LiveEvent.find({ owner: userId, startDateTime: { $gte: prevStart, $lt: start }, ...platformFilter }).select('_id');
    const prevIds = prevEvents.map(e => e._id);
    const prevMetrics = await LiveEventMetrics.find({ event: { $in: prevIds } });
    const productMetricsPrev = await LiveEventProductMetrics.find({ event: { $in: prevIds } });

    const sumPrev = prevMetrics.reduce((acc, m) => {
      acc.durationSeconds += Number(m.durationSeconds || 0);
      acc.uniqueViewers += Number(m.uniqueViewers || 0);
      acc.views += Number(m.views || 0);
      acc.productClicks += Number(m.productClicks || 0);
      acc.revenue += Number(m.revenue || m.salesAmount || 0);
      acc.comments += Number(m.comments || 0);
      acc.newFollowers += Number(m.newFollowers || 0);
      return acc;
    }, { durationSeconds: 0, uniqueViewers: 0, views: 0, productClicks: 0, cartAdds: 0, purchases: 0, revenue: 0, comments: 0, newFollowers: 0 });

    productMetricsPrev.forEach(pm => {
      sumPrev.cartAdds += Number(pm.cartAdds || 0);
      sumPrev.purchases += Number(pm.purchases || 0);
      sumPrev.revenue += Number(pm.revenue || 0);
    });

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
      prev: {
        durationSeconds: sumPrev.durationSeconds,
        uniqueViewers: sumPrev.uniqueViewers,
        productClicks: sumPrev.productClicks,
        cartAdds: sumPrev.cartAdds,
        purchases: sumPrev.purchases,
        revenue: sumPrev.revenue,
        comments: sumPrev.comments,
        newFollowers: sumPrev.newFollowers,
        eventsCount: prevEvents.length || 0,
        peakViewers: prevMetrics.reduce((max, m) => Math.max(max, Number(m.peakViewers || 0)), 0),
      },
      trends: {
        durationSeconds: trend(durationSeconds, sumPrev.durationSeconds),
        uniqueViewers: trend(uniqueViewers, sumPrev.uniqueViewers),
        productClicks: trend(productClicks, sumPrev.productClicks),
        cartAdds: trend(cartAdds, sumPrev.cartAdds),
        purchases: trend(purchases, sumPrev.purchases),
        revenue: trend(revenue, sumPrev.revenue),
        comments: trend(comments, sumPrev.comments),
        newFollowers: trend(newFollowers, sumPrev.newFollowers),
        livesEmitted: trend(livesEmitted, prevEvents.length || 0),
        peakViewers: trend(peakViewers, prevMetrics.reduce((max, m) => Math.max(max, Number(m.peakViewers || 0)), 0)),
        ctr: (() => {
          const ctrPrevBase = sumPrev.views > 0 ? sumPrev.views : sumPrev.uniqueViewers;
          const ctrPrev = ctrPrevBase > 0 ? +(sumPrev.productClicks * 100 / ctrPrevBase).toFixed(2) : 0;
          return trend(ctr, ctrPrev);
        })(),
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
    const metricsArr = await LiveEventMetrics.find({ event: { $in: eventIds } }).select('event uniqueViewers productClicks');
    const eventStartMap = new Map(events.map(e => [e._id.toString(), e.startDateTime]));

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

      const metricsMap = new Map(metricsArr.map(m => [m.event.toString(), { uv: Number(m.uniqueViewers || 0), clicks: Number(m.productClicks || 0) }]));
      const normalized = series.map(s => {
        const idStr = (s._id || '').toString();
        const startTs = eventStartMap.get(idStr) || start;
        const mm = metricsMap.get(idStr) || { uv: 0, clicks: 0 };
        const ctr = mm.uv > 0 ? +(mm.clicks * 100 / mm.uv).toFixed(2) : 0;
        return {
          timestamp: startTs,
          avgViewers: s.avgViewers || 0,
          maxViewers: s.maxViewers || 0,
          ctr,
        };
      });
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
      const ctrBuckets = new Map();
      metricsArr.forEach(m => {
        const evId = (m.event || '').toString();
        const sd = eventStartMap.get(evId);
        if (!sd) return;
        const t = new Date(sd);
        const base = Math.floor(t.getTime() / bucketSizeMs) * bucketSizeMs;
        const key = new Date(base).toISOString();
        const curr = ctrBuckets.get(key) || { uv: 0, clicks: 0 };
        curr.uv += Number(m.uniqueViewers || 0);
        curr.clicks += Number(m.productClicks || 0);
        ctrBuckets.set(key, curr);
      });
      const withCtr = series.map(s => {
        const key = new Date(s.timestamp).toISOString();
        const b = ctrBuckets.get(key);
        const ctr = b && b.uv > 0 ? +((b.clicks * 100) / b.uv).toFixed(2) : 0;
        return { ...s, ctr };
      });
      return res.json({ success: true, data: withCtr });
    }
  } catch (error) {
    console.error('Error agregando audiencia', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.getAdminLiveEventsSummary = async (req, res) => {
  try {
    const [totalEvents, draftEvents, publishedEvents, liveEvents, finishedEvents, linkedCampaignEvents] = await Promise.all([
      require('../models/LiveEvent').countDocuments({}),
      require('../models/LiveEvent').countDocuments({ status: 'draft' }),
      require('../models/LiveEvent').countDocuments({ status: 'published' }),
      require('../models/LiveEvent').countDocuments({ status: 'live' }),
      require('../models/LiveEvent').countDocuments({ status: 'finished' }),
      require('../models/LiveEvent').countDocuments({ campaign: { $ne: null } })
    ]);

    return res.json({
      success: true,
      data: { totalEvents, draftEvents, publishedEvents, liveEvents, finishedEvents, linkedCampaignEvents },
      message: 'Resumen de eventos en vivo'
    });
  } catch (error) {
    console.error('Error obteniendo resumen de eventos en vivo', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

exports.listAdminLiveEvents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const { status, ownerEmail, campaignId } = req.query || {};

    const filter = {};
    if (status) filter.status = status;
    if (campaignId) filter.campaign = campaignId;

    if (ownerEmail && typeof ownerEmail === 'string' && ownerEmail.trim() !== '') {
      const owners = await User.find({ email: new RegExp(`^${ownerEmail}`, 'i') }).select('_id');
      const ownerIds = owners.map(u => u._id);
      if (ownerIds.length > 0) filter.owner = { $in: ownerIds };
      else filter.owner = null;
    }

    const total = await LiveEvent.countDocuments(filter);
    const events = await LiveEvent.find(filter)
      .select('title startDateTime status owner campaign youtubeVideoId')
      .populate({ path: 'owner', select: 'name fullName email avatar' })
      .populate({ path: 'campaign', select: '_id name' })
      .sort({ startDateTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.json({ success: true, data: { total, page, limit, events } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error listando eventos', error: error.message });
  }
};

exports.updateLiveEventStateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, youtubeVideoId } = req.body || {};
    const allowed = ['draft', 'published', 'live', 'finished'];
    if (!allowed.includes(String(status))) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

    const event = await LiveEvent.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    const prevStatus = event.status;
    const before = { status: prevStatus };

    if (status !== prevStatus) {
      if (status === 'live' && prevStatus !== 'live') {
        event.endedAt = null;
        if (!event.startDateTime || event.startDateTime > new Date()) {
          event.startDateTime = new Date();
        }
        try {
          const YoutubeMonitor = require('../services/youtube.monitor');
          const vid = youtubeVideoId !== undefined ? youtubeVideoId : event.youtubeVideoId;
          if (vid) {
            YoutubeMonitor.start(event._id.toString(), vid);
          }
        } catch (_) {}
      }
      if (status === 'finished' && prevStatus !== 'finished') {
        event.endedAt = new Date();
        try {
          const YoutubeMonitor = require('../services/youtube.monitor');
          YoutubeMonitor.stop(event._id.toString());
        } catch (_) {}
      }
    }

    event.status = status;
    if (youtubeVideoId !== undefined) event.youtubeVideoId = youtubeVideoId;
    await event.save();

    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'liveEvent.status.update',
        entityType: 'LiveEvent',
        entityId: event._id,
        before,
        after: { status: event.status },
        metadata: { ip: req.ip }
      });
    } catch (_) {}

    return res.json({ success: true, data: event, message: 'Estado de evento actualizado' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error actualizando estado', error: error.message });
  }
};
