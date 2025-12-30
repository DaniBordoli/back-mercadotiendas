const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Referencia al usuario que realizó el pago
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  mobbexId: {
    type: String,
  },
  
  reference: {
    type: String,
    required: true
  },
  
  amount: {
    type: Number,
    required: true
  },
  
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
    productImage: {
      type: String
    },
    shopName: {
      type: String,
      required: true
    }
  }],

  liveEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: false,
    index: true
  },
  
  currency: {
    type: String,
    default: 'ARS'
  },

  provider: {
    type: String,
    default: 'mobbex',
    index: true
  },

  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: false,
    index: true
  },

  globalOrderId: {
    type: String
  },

  mpPaymentId: {
    type: String,
    index: true
  },
  mpPreferenceId: {
    type: String,
    index: true
  },
  mpStatus: {
    type: String
  },
  mpStatusDetail: {
    type: String
  },
  mpPayerEmail: {
    type: String
  },
  mpRaw: {
    type: Object
  },

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
  
  paymentMethod: {
    type: Object
  },
  
  paymentData: {
    type: Object
  },

  shippingDetails: {
    carrier: { type: String },
    methodId: { type: String },
    methodName: { type: String },
    cost: { type: Number },
    branchId: { type: String },
    trackingNumber: { type: String }
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

const { validatePaymentUser } = require('../middleware/payment-validation');

paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

paymentSchema.pre('save', validatePaymentUser);

paymentSchema.index(
  { mobbexId: 1, reference: 1 },
  { unique: true, partialFilterExpression: { mobbexId: { $exists: true, $ne: null } } }
);

paymentSchema.index(
  { mpPaymentId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
