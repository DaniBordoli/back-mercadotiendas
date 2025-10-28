const mongoose = require('mongoose');

const liveEventMetricsSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      required: true,
      unique: true
    },
    uniqueViewers: {
      type: Number,
      default: 0
    },
    productClicks: {
      type: Number,
      default: 0
    },
    cartAdds: {
      type: Number,
      default: 0
    },
    purchases: {
      type: Number,
      default: 0
    },
    salesAmount: {
      type: Number,
      default: 0
    },
    // Máximo número de espectadores concurrentes alcanzado durante la transmisión
    peakViewers: {
      type: Number,
      default: 0,
    },
    // Promedio de espectadores concurrentes durante toda la transmisión
    avgConcurrentViewers: {
      type: Number,
      default: 0,
    },
    // Duración total de la transmisión en segundos (alternativa a calcular con start/end)
    durationSeconds: {
      type: Number,
      default: 0,
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LiveEventMetrics', liveEventMetricsSchema);