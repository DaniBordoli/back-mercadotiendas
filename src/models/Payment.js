const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Referencia al usuario que realizó el pago
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Datos de la operación de Mobbex
  mobbexId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Referencia interna (por ejemplo, número de orden)
  reference: {
    type: String,
    required: true
  },
  
  // Monto total del pago
  amount: {
    type: Number,
    required: true
  },
  
  // Esquema de los ítems comprados
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Products',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: { // Precio del producto en el momento de la compra
      type: Number,
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    productImage: { // URL de la imagen principal del producto
      type: String
    },
    shopName: { // Nombre de la tienda a la que pertenece el producto
      type: String,
      required: true
    }
  }],
  
  // Evento en vivo asociado (opcional)
  liveEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: false,
    index: true
  },
  
  // Moneda del pago
  currency: {
    type: String,
    default: 'ARS'
  },
  
  // Estado del pago
  status: {
    code: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  },
  
  // Método de pago utilizado
  paymentMethod: {
    type: Object
  },
  
  // Datos adicionales del pago (como cuotas, etc.)
  paymentData: {
    type: Object
  },
  
  // Fecha de creación del pago
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Fecha de actualización del pago
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const { validatePaymentUser } = require('../middleware/payment-validation');

// Middleware para actualizar updatedAt antes de guardar
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Middleware para validar que el usuario existe antes de guardar
paymentSchema.pre('save', validatePaymentUser);

module.exports = mongoose.model('Payment', paymentSchema);
