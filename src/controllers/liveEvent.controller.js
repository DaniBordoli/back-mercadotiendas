const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { LiveEvent, User } = require('../models');

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

    const { title, description, date, time, status, products = [], socialAccounts = [], youtubeVideoId } = req.body;

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
      youtubeVideoId,
    });

    await liveEvent.save();
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
// Actualizar producto destacado del evento
exports.updateHighlightedProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId es requerido' });
    }

    // Determinar si id es un ObjectId válido o slug
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    // Buscar el evento por _id o por slug, además de asegurarse que pertenece al usuario
    const eventQuery = isValidObjectId ? { _id: id } : { slug: id };
    // Asegurar que el evento pertenece al usuario autenticado
    eventQuery.owner = req.user._id;

    const event = await LiveEvent.findOne(eventQuery).populate('products');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    }

    // Verificar que productId está dentro de products del evento
    if (!event.products.some(p => (p.equals ? p.equals(productId) : p._id.equals(productId)))) {
      return res.status(400).json({ success: false, message: 'El producto no pertenece al evento' });
    }

    event.highlightedProduct = productId;
    await event.save();
    res.json({ success: true, highlightedProduct: event.highlightedProduct });
  } catch (error) {
    console.error('Error actualizando producto destacado', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
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
    if (products !== undefined) event.products = products;
    if (socialAccounts !== undefined) event.socialAccounts = socialAccounts;
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