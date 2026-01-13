const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, trim: true },
    priority: { type: String, enum: ['baja', 'media', 'alta'], default: 'media', index: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    orderId: { type: String, trim: true },
    storeId: { type: String, trim: true },
    campaignId: { type: String, trim: true },
    metadata: { type: Object, default: {} },
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'closed'], default: 'open', index: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastUpdateSource: { type: String, enum: ['system', 'agent'], default: 'system' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

