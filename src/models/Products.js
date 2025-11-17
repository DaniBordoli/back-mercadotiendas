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
  oldPrice: {
    type: String
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  stock: {
    type: Number
  },
  // Especificaciones obligatorias
  largoCm: {
    type: Number,
    required: true,
    min: 0
  },
  anchoCm: {
    type: Number,
    required: true,
    min: 0
  },
  altoCm: {
    type: Number,
    required: true,
    min: 0
  },
  pesoKg: {
    type: Number,
    required: true,
    min: 0
  },
  // Atributos personalizados opcionales
  customAttributes: [{
    nombre: {
      type: String,
      trim: true
    },
    valor: {
      type: String,
      trim: true
    }
  }],
  categoria: {
    type: String
  },
  subcategoria: {
    type: String
  },
  visitas: {
    type: Number,
    default: 0
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
