const mongoose = require('mongoose');

const campaignApplicationSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: false
  },
  socialMediaLinks: [{
    platform: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    followers: {
      type: Number
    }
  }],

  // Plataformas seleccionadas (en caso de diferenciar de socialMediaLinks)
  platforms: [{
    platform: { type: String, required: true },
    url: { type: String },
    followers: { type: Number },
    cost: { type: Number }
  }],

  // Arreglo de hitos propuestos por el influencer
  milestones: [{
    title: { type: String, required: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    notes: { type: String },
    status: { type: String, enum: ['pending', 'submitted', 'approved', 'rejected'], default: 'pending' },
    submittedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null }
  }],

  // Monto total de la propuesta (suma de los hitos)
  totalAmount: {
    type: Number,
    required: false
  },

  status: {
    type: String,
    enum: ['draft', 'pending', 'accepted', 'rejected', 'viewed', 'completed'],
    default: 'pending'
  },
  // Fecha en la que el vendedor tomó la decisión (aceptar/rechazar)
  decidedAt: {
    type: Date,
    default: null
  },
  // Usuario que tomó la decisión (owner de la tienda)
  decidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Motivo del rechazo (solo cuando status = 'rejected')
  rejectReason: {
    type: String,
    default: null
  },
  // Indica si la propuesta fue bloqueada (milestones/costos) después de ser aceptada
  isLocked: {
    type: Boolean,
    default: false
  },
  proposedFee: {
    type: Number,
    required: false
  },
  currency: {
    type: String,
    enum: ['USD', 'ARS'],
    default: 'ARS'
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

// Middleware para actualizar updatedAt antes de cada save
campaignApplicationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Nota: Se elimina el índice único compuesto (campaign + user) para permitir
// re-postulaciones en campañas cuando la aplicación previa fue rechazada.

module.exports = mongoose.model('CampaignApplication', campaignApplicationSchema);
