const mongoose = require('mongoose');

/**
 * LiveEventProductMetrics
 * Almacena métricas por producto dentro de un evento en vivo
 *  - event: referencia al LiveEvent
 *  - product: referencia al Product
 *  - timeHighlighted: tiempo total (segundos) que el producto estuvo destacado
 *  - clicks: número de clics al producto durante la transmisión
 *  - cartAdds: veces que se agregó al carrito desde la transmisión
 *  - purchases: cantidad de unidades vendidas durante la transmisión
 *  - revenue: monto total generado por las ventas del producto durante la transmisión
 */
const liveEventProductMetricsSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    timeHighlighted: {
      type: Number, // segundos acumulados
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    cartAdds: {
      type: Number,
      default: 0,
    },
    purchases: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para búsquedas rápidas por evento + producto
liveEventProductMetricsSchema.index({ event: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('LiveEventProductMetrics', liveEventProductMetricsSchema);