const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  layoutDesign: {
    type: String,
    optional: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: 'other'
  },
  address: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    required: true
  },
  shopPhone: {
    type: String,
    default: ''
  },
  taxAdress: {
    type: String,
    default: ''
  },
  preferredCurrency: {
    type: String,
    default: ''
  },
  languageMain: {
    type: String,
    default: ''
  },
  province: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String
  },
  templateUpdate: {
    type: Object,
    default: {}
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  subdomain: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Credenciales de Mobbex por tienda
  mobbexApiKey: {
    type: String,
    default: null
  },
  mobbexAccessToken: {
    type: String,
    default: null
  }
});

// Middleware para actualizar updatedAt antes de cada save
shopSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add method to check if shop is active
shopSchema.methods.isActive = function() {
  return this.active === true;
};

module.exports = mongoose.model('Shop', shopSchema);
