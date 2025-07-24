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
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  budget: {
    type: Number,
    required: true
  },
  imageUrl: {
    type: String,
    default: 'https://via.placeholder.com/800x400?text=Campa%C3%B1a+MercadoTiendas'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'draft'],
    default: 'draft'
  },
  category: {
    type: String,
    required: true
  },
  requirements: {
    type: String,
    required: false
  },
  applicationsCount: {
    type: Number,
    default: 0
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
