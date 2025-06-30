const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  symbol: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3,
    match: /^[A-Z]{3}$/
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Índices para mejorar performance
currencySchema.index({ code: 1 });
currencySchema.index({ isActive: 1 });
currencySchema.index({ createdAt: -1 });

// Método para formato JSON limpio
currencySchema.methods.toJSON = function() {
  const currency = this;
  const currencyObject = currency.toObject();
  
  return {
    id: currencyObject._id,
    name: currencyObject.name,
    symbol: currencyObject.symbol,
    code: currencyObject.code,
    isActive: currencyObject.isActive,
    createdAt: currencyObject.createdAt,
    updatedAt: currencyObject.updatedAt
  };
};

const Currency = mongoose.model('Currency', currencySchema);

module.exports = Currency;
