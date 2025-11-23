const mongoose = require('mongoose');

const productVisitSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Products',
      required: true,
      index: true
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true
    },
    visitedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false // solo necesitamos visitedAt
  }
);

// Índice compuesto para consultas de rango por fecha y producto o tienda
productVisitSchema.index({ shop: 1, visitedAt: 1 });
productVisitSchema.index({ product: 1, visitedAt: 1 });

module.exports = mongoose.model('ProductVisit', productVisitSchema);