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
    // Total de visualizaciones (no únicas) durante la transmisión
    views: {
      type: Number,
      default: 0,
    },
    // Ventas directas (checkout completado)
    directSales: {
      type: Number,
      default: 0,
    },
    purchases: {
      type: Number,
      default: 0,
    },
    // Ingresos totales generados durante la transmisión (equivale a KPI "revenue")
    revenue: {
      type: Number,
      default: 0,
    },
    // Tasa de clics (CTR) calculada o actualizada periódicamente
    ctr: {
      type: Number,
      default: 0,
    },
    // Campo legado (opcional) mantenido para compatibilidad; se puede deprecar más adelante
    salesAmount: {
      type: Number,
      default: 0,
    },
    // Número total de "me gusta" recibidos durante la transmisión
    likes: {
      type: Number,
      default: 0,
    },
    // Número total de veces que se compartió el evento
    shares: {
      type: Number,
      default: 0,
    },
    // Número total de comentarios recibidos durante la transmisión
    comments: {
      type: Number,
      default: 0,
    },
    newFollowers: {
      type: Number,
      default: 0,
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
    },
    // Feed de actividad en vivo: guarda los últimos eventos relevantes
    activityFeed: [
      {
        type: {
          type: String,
          enum: [
            'viewer', // nuevo espectador
            'click', // clic en producto
            'cartAdd', // producto añadido al carrito
            'sale', // venta realizada
            'milestone', // milestone alcanzado
            'other', // genérico
          ],
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        ts: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LiveEventMetrics', liveEventMetricsSchema);