const AuditLog = require('../models/AuditLog');
const { successResponse, errorResponse } = require('../utils/response');

exports.listAdminAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const actorEmail = typeof req.query.actorEmail === 'string' ? req.query.actorEmail : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const format = typeof req.query.format === 'string' ? req.query.format : undefined;

    const filter = {};
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;
    if (actorEmail) {
      const { User } = require('../models');
      const actors = await User.find({ email: actorEmail }).select('_id').lean();
      const ids = actors.map(a => a._id);
      filter.actor = ids.length ? { $in: ids } : { $in: [] };
    }
    if (from) {
      filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(from) };
    }
    if (to) {
      filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name fullName email');

    if (format === 'csv') {
      const header = 'createdAt,actorEmail,action,entityType,entityId,before,after';
      const esc = (s) => String(s ?? '').replace(/"/g, '""');
      const rows = logs.map(l => {
        const createdAtIso = (l.createdAt instanceof Date ? l.createdAt.toISOString() : new Date(l.createdAt).toISOString());
        const actorEmailOut = l.actor && l.actor.email ? l.actor.email : '';
        const beforeOut = l.before ? JSON.stringify(l.before) : '';
        const afterOut = l.after ? JSON.stringify(l.after) : '';
        return `"${esc(createdAtIso)}","${esc(actorEmailOut)}","${esc(l.action)}","${esc(l.entityType)}","${esc(String(l.entityId))}","${esc(beforeOut)}","${esc(afterOut)}"`;
      });
      const csv = [header, ...rows].join('\n');
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${dateStr}.csv"`);
      return res.status(200).send(csv);
    }

    if (format === 'json') {
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${dateStr}.json"`);
      return res.status(200).json(logs);
    }

    return successResponse(res, { total, page, limit, logs }, 'Listado de auditoría');
  } catch (err) {
    return errorResponse(res, 'Error al listar auditoría', 500, err.message);
  }
};
