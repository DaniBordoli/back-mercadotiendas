const mongoose = require('mongoose');

const campaignApplicationSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  socialMediaLinks: [{
    platform: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    followers: {
      type: Number,
      required: false
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  proposedFee: {
    type: Number,
    required: false
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
campaignApplicationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Índice compuesto para evitar múltiples aplicaciones del mismo usuario a la misma campaña
campaignApplicationSchema.index({ campaign: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CampaignApplication', campaignApplicationSchema);
