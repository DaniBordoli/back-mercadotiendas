const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nombre: {
    type: String,
    trim: true
  },
  descripcion: {
    type: String,
    trim: true
  },
  sku: {
    type: String,
    unique: true,
    trim: true
  },
  estado: {
    type: String,
  },
  productImages: [{
    type: String,
  }],
  precio: {
    type: String
  },
  stock: {
    type: String
  },
  categoria: {
    type: String
  },
  subcategoria: {
    type: String
  },
   color: [{
    type: String
  }],
   talle: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});


productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);
