const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['active', 'deleted', 'hidden'], default: 'active', index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatMessageSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
