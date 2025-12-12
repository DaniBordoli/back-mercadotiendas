const { successResponse, errorResponse } = require('../utils/response');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');

const getOrCreateConfig = async () => {
  let cfg = await SystemConfig.findOne({});
  if (!cfg) {
    cfg = await SystemConfig.create({
      maintenanceMode: false,
      paymentGateways: {},
      limits: {
        maxLiveEventsPerDay: 10,
        maxPendingDisputesPerUser: 5
      },
      policies: {
        allowNewCampaigns: true,
        requireShopVerification: false
      }
    });
  }
  return cfg;
};

exports.getSystemConfigAdmin = async (req, res) => {
  try {
    const cfg = await getOrCreateConfig();
    return successResponse(res, { config: cfg }, 'Configuración del sistema');
  } catch (err) {
    return errorResponse(res, 'Error obteniendo configuración del sistema', 500, err.message);
  }
};

exports.updateSystemConfigAdmin = async (req, res) => {
  try {
    const before = await getOrCreateConfig();
    const patch = req.body || {};

    const allowedKeys = ['maintenanceMode', 'paymentGateways', 'limits', 'policies'];
    const updates = {};
    for (const k of allowedKeys) {
      if (k in patch) {
        updates[k] = patch[k];
      }
    }

    const cfg = await SystemConfig.findByIdAndUpdate(
      before._id,
      { $set: updates },
      { new: true }
    );

    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'system.config.update',
        entityType: 'SystemConfig',
        entityId: cfg._id,
        before: {
          maintenanceMode: before.maintenanceMode,
          paymentGateways: before.paymentGateways,
          limits: before.limits,
          policies: before.policies
        },
        after: {
          maintenanceMode: cfg.maintenanceMode,
          paymentGateways: cfg.paymentGateways,
          limits: cfg.limits,
          policies: cfg.policies
        },
        metadata: { ip: req.ip }
      });
    } catch {}

    return successResponse(res, { config: cfg }, 'Configuración actualizada');
  } catch (err) {
    return errorResponse(res, 'Error actualizando configuración del sistema', 500, err.message);
  }
};
