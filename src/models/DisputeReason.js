const mongoose = require('mongoose');

const disputeReasonSchema = new mongoose.Schema(
  {
    clave: { type: String, required: true, unique: true },
    titulo: { type: String, required: true },
    categoria: { type: String, required: true },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DisputeReason', disputeReasonSchema);

