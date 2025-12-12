const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    maintenanceMode: { type: Boolean, default: false },
    paymentGateways: { type: Object, default: {} },
    limits: { type: Object, default: {} },
    policies: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
