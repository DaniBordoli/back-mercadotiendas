const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');
const mongoose = require('mongoose');

/**
 * GET /api/notifications
 * Lista las notificaciones del usuario autenticado
 * Soporta paginación mediante query params ?page=1&limit=20
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // Paginación
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Filtros dinámicos
    const {
      status, // 'all' | 'unread' | 'read'
      types, // comma separated list
      from,
      to,
      important, // 'true' | 'false'
      search // texto libre
    } = req.query;

    const filter = { user: userId };

    // Estado (leída / no leída)
    if (status === 'unread') filter.isRead = false;
    if (status === 'read') filter.isRead = true;

    // Tipos de notificación
    if (types) {
      const arr = String(types)
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (arr.length) filter.type = { $in: arr };
    }

    // Rango de fechas
    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        // agregar un día completo al to para incluir ese día
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    // Importantes (se guarda en data.important = true)
    if (important === 'true') {
      filter['data.important'] = true;
    }

    // Búsqueda por título o mensaje
    let finalFilter = filter;
    if (search) {
      const regex = new RegExp(String(search), 'i');
      finalFilter = {
        $and: [
          filter,
          {
            $or: [{ title: regex }, { message: regex }]
          }
        ]
      };
    }

    const [notifications, total] = await Promise.all([
      Notification.find(finalFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(finalFilter)
    ]);

    return successResponse(
      res,
      {
        notifications,
        page,
        totalPages: Math.ceil(total / limit),
        total,
      },
      'Notificaciones obtenidas exitosamente'
    );
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    return errorResponse(
      res,
      'Error al obtener las notificaciones',
      500,
      error.message
    );
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marca una notificación específica como leída
 */
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 'ID de notificación inválido', 400);
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return errorResponse(res, 'Notificación no encontrada', 404);
    }

    return successResponse(res, notification, 'Notificación marcada como leída');
  } catch (error) {
    console.error('Error al marcar notificación como leída:', error);
    return errorResponse(res, 'Error al marcar notificación como leída', 500, error.message);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marca todas las notificaciones del usuario como leídas
 */
const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return successResponse(res, {
      matched: result.matchedCount || result.n, // soporte para distintas versiones de mongoose
      modified: result.modifiedCount || result.nModified
    }, 'Todas las notificaciones marcadas como leídas');
  } catch (error) {
    console.error('Error al marcar todas las notificaciones como leídas:', error);
    return errorResponse(res, 'Error al marcar todas las notificaciones como leídas', 500, error.message);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
};