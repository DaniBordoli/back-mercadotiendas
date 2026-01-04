const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxLength: 100
    },
    role: {
      type: String,
      trim: true,
      maxLength: 100
    },
    imageUrl: {
      type: String,
      trim: true,
      maxLength: 500
    },
    description: {
      type: String,
      trim: true,
      maxLength: 1000
    },
    instagramUrl: {
      type: String,
      trim: true,
      maxLength: 500
    },
    tiktokUrl: {
      type: String,
      trim: true,
      maxLength: 500
    },
    facebookUrl: {
      type: String,
      trim: true,
      maxLength: 500
    }
  },
  { _id: false }
);

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
  shippingPolicy: {
    type: String,
    trim: true,
    maxLength: 5000
  },
  returnPolicy: {
    type: String,
    trim: true,
    maxLength: 5000
  },
  termsAndConditions: {
    type: String,
    trim: true,
    maxLength: 5000
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
  taxId: {
    type: String,
    trim: true,
    maxLength: 100
  },
  businessName: {
    type: String,
    trim: true,
    maxLength: 255
  },
  fiscalAddress: {
    type: String,
    trim: true,
    maxLength: 500
  },
  teamMembers: {
    type: [teamMemberSchema],
    default: []
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

shopInstitutionalSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ShopInstitutional', shopInstitutionalSchema);
