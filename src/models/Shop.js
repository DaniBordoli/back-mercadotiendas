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
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  brandName: {
    type: String,
    optional: true
  },
  address: {
    type: String,
    optional: true,
    unique: true,
  },
  contactEmail: {
    type: String,
    required: true
  },
  shopPhone: {
    type: String
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
  }
});

// Middleware para actualizar updatedAt antes de cada save
shopSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Shop', shopSchema);
