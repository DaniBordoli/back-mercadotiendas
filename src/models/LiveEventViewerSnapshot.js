const mongoose = require('mongoose');

// Este modelo almacena snapshots del número de espectadores de un evento en vivo
// en diferentes momentos del tiempo. Servirá como base para graficar la evolución
// "Espectadores vs. Tiempo" y para emitir actualizaciones en tiempo real.

const liveEventViewerSnapshotSchema = new mongoose.Schema(
  {
    // Evento al que pertenece esta muestra
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      required: true,
      index: true
    },
    // Momento exacto del snapshot
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Número de espectadores concurrentes en ese instante
    viewersCount: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Índice compuesto para consultas rápidas por evento y orden cronológico
liveEventViewerSnapshotSchema.index({ event: 1, timestamp: 1 });

module.exports = mongoose.model('LiveEventViewerSnapshot', liveEventViewerSnapshotSchema);