const mongoose = require('mongoose');

const shopVisitSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    visitedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // solo necesitamos visitedAt
  }
);

// Índices para consultas eficientes por shop y fecha
shopVisitSchema.index({ shop: 1, visitedAt: 1 });
shopVisitSchema.index({ shop: 1, user: 1, visitedAt: 1 });

module.exports = mongoose.model('ShopVisit', shopVisitSchema);