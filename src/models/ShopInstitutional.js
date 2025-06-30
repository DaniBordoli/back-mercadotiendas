const mongoose = require('mongoose');

const shopInstitutionalSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    unique: true
  },
  description: {
    type: String,
    trim: true,
    maxLength: 2000
  },
  mission: {
    type: String,
    trim: true,
    maxLength: 2000
  },
  vision: {
    type: String,
    trim: true,
    maxLength: 2000
  },
  history: {
    type: String,
    trim: true,
    maxLength: 5000
  },
  values: {
    type: String,
    trim: true,
    maxLength: 2000
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
shopInstitutionalSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ShopInstitutional', shopInstitutionalSchema);
