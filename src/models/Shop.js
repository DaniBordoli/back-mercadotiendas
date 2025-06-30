const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  mission: {
    type: String,
    trim: true
  },
  vision: {
    type: String,
    trim: true
  },
  history: {
    type: String,
    trim: true
  },
  values: {
    type: String,
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
  primaryColor: {
    type: String,
    optional: true
  },
  secondaryColor: {
    type: String,
    optional: true
  },
  accentColor: {
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
  }
});

// Middleware para actualizar updatedAt antes de cada save
shopSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Shop', shopSchema);
