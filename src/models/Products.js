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
    type: Number
  },
  categoria: {
    type: String
  },
  subcategoria: {
    type: String
  },
  variantes: [{
    tipo: {
      type: String,
      required: true
    },
    valores: [{
      type: String,
      required: true
    }]
  }],
  tieneVariantes: {
    type: Boolean,
    default: false
  },
  combinacionesVariantes: [{
    id: {
      type: String,
      required: true
    },
    combination: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    sku: {
      type: String,
      trim: true
    },
    price: {
      type: String
    },
    stock: {
      type: String
    },
    image: {
      type: String
    }
  }],
  codigoBarras: {
    type: String,
    trim: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
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


productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Product', productSchema);
