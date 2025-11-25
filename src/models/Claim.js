const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, trim: true },
    reference: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true },
    shopName: { type: String, trim: true },
    tipoProblema: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true, maxlength: 2000 },
    files: [
      {
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        url: { type: String, required: true }
      }
    ],
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Claim', claimSchema);

