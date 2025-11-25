const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    context: { type: String, enum: ['order', 'campaign', 'application'], default: 'order', index: true },
    orderId: { type: String, index: true },
    reference: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Products' },
    productName: { type: String },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignApplication' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: { type: String },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    motivoClave: { type: String, required: true },
    descripcionInicial: { type: String, required: true },
    estado: { type: String, enum: ['open','in_review','awaiting_party_a','awaiting_party_b','proposal','resolved','closed_expired','rejected','escalated'], default: 'open' },
    slaHoras: { type: Number, default: 72 },
    vencimientoActual: { type: Date },
    cierreTipo: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);
