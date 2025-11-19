const mongoose = require('mongoose');

/**
 * Modelo Notification
 * Representa cualquier notificación que el sistema envía a un usuario
 * (buyer, seller, influencer, admin, etc.)
 */
const notificationSchema = new mongoose.Schema({
  // Usuario que recibirá la notificación
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Tipo de notificación (ej: 'order', 'payment', 'review', 'campaign', etc.)
  type: {
    type: String,
    required: true
  },

  // Título breve o encabezado
  title: {
    type: String,
    required: true,
    trim: true
  },

  // Mensaje detallado (opcional)
  message: {
    type: String,
    trim: true,
    default: ''
  },

  // Referencia al objeto relacionado (opcional)
  // Puede ser Order, Payment, Campaign, ProductReview, etc.
  entity: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true
  },

  // Datos adicionales para renderizar en el frontend (JSON libre)
  data: {
    type: Object,
    default: {}
  },

  // Indicador de lectura
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },

  readAt: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar updatedAt antes de guardar
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);