const mongoose = require('mongoose');

const disputeMessageSchema = new mongoose.Schema(
  {
    disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', required: true, index: true },
    autorRol: { type: String, enum: ['buyer','seller','influencer','moderator','system'], required: true },
    autorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    texto: { type: String },
    files: [
      {
        originalName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        url: { type: String }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('DisputeMessage', disputeMessageSchema);
