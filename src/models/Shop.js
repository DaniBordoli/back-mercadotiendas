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
  address: {
    type: String,
    optional: true,
  },
  contactEmail: {
    type: String,
    required: true
  },
  shopPhone: {
    type: String,
    optional: true
  },
  taxAdress: {
    type: String,
    Optional: true
  },
  preferredCurrency: {
    type: String,
    Optional: true
  },
  languageMain: {
    type: String,
    Optional: true
  },
  province: {
    type: String,
    Optional: true
  },
  city: {
    type: String,
    Optional: true
  },
  country: {
    type: String,
    Optional: true
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
