const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  // Objetivos generales de la campaña (al menos uno)
  objectives: {
    type: [String],
    required: true,
    validate: v => Array.isArray(v) && v.length > 0
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  budget: {
    type: Number,
    required: false // Deja de ser obligatorio en el paso 1
  },
  imageUrl: {
    type: String,
    default: 'https://via.placeholder.com/800x400?text=Campa%C3%B1a+MercadoTiendas'
  },
  startDate: {
    type: Date,
    required: true // Ahora se exige fecha de inicio
  },
  endDate: {
    type: Date,
    required: false // Opcional hasta paso posterior
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'draft'],
    default: 'draft'
  },
  category: {
    type: String,
    required: false // Opcional hasta paso posterior
  },
  requirements: {
    type: String,
    required: false
  },
  // Nuevos campos para el flujo del wizard
  products: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
  ],
  milestones: [
    {
      name: { type: String, required: false },
      description: { type: String, required: false },
      date: { type: Date, required: false },
      kpiKey: { type: String, required: false },
      completedAt: { type: Date, required: false },
    },
  ],
  kpis: {
    clicks: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
    sales: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
    viewers: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
    addtocart: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
    ctr: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
    revenue: {
      selected: { type: Boolean, default: false },
      target: { type: Number, default: 0 },
    },
  },
  applicationsCount: {
    type: Number,
    default: 0
  },
  // Indica si la campaña aceptará solo una postulación (exclusiva)
  exclusive: {
    type: Boolean,
    default: false
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
campaignSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para verificar si la campaña está activa
campaignSchema.methods.isActive = function() {
  return this.status === 'active' && new Date() <= this.endDate;
};

// Método para verificar si la campaña ha expirado
campaignSchema.methods.hasExpired = function() {
  return new Date() > this.endDate;
};

// Método para incrementar el contador de aplicaciones
campaignSchema.methods.incrementApplicationsCount = function() {
  this.applicationsCount += 1;
  return this.save();
};

module.exports = mongoose.model('Campaign', campaignSchema);
