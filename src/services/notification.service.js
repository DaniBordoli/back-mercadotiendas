const Notification = require('../models/Notification');
const { NotificationTypes } = require('../constants/notificationTypes');

/**
 * Servicio centralizado para persistir y emitir notificaciones.
 */
class NotificationService {
  /**
   * Crea notificaciones en DB y las emite por Socket.io
   * Soporta envío a un usuario o a múltiples usuarios.
   * @param {Object} io - Instancia de Socket.io
   * @param {Object} params - Parámetros de la notificación
   * @param {string|string[]} params.users - ID(s) de usuario(s) destinatario(s)
   * @param {string} params.type - Tipo de notificación (usar NotificationTypes)
   * @param {string} params.title - Título
   * @param {string} params.message - Mensaje
   * @param {string} [params.entity] - ID de la entidad relacionada (Order, Campaign, etc.)
   * @param {Object} [params.data] - Datos extra para el frontend
   */
  static async emitAndPersist(io, { users, type, title, message, entity = null, data = {} }) {
    try {
      const userIds = Array.isArray(users) ? users : [users];
      if (userIds.length === 0) return;

      // 1. Preparar documentos para MongoDB
      const notificationsToSave = userIds.map((userId) => ({
        user: userId,
        type,
        title,
        message,
        entity,
        data,
        isRead: false,
        createdAt: new Date()
      }));

      // 2. Persistencia Bulk (Eficiente)
      const savedNotifications = await Notification.insertMany(notificationsToSave);

      // 3. Emisión en Tiempo Real
      savedNotifications.forEach((notification) => {
        const userId = notification.user.toString();
        if (io) {
          io.to(`user_${userId}`).emit('notification:new', notification);
          if (type === NotificationTypes.LIVE_HIGHLIGHT && data.eventId) {
            io.to(`event_${data.eventId}`).emit('highlightChanged', data);
          }
        }
      });

      return savedNotifications;
    } catch (error) {
      console.error('[NotificationService] Error emitting notification:', error);
      // No lanzamos error para no romper el flujo principal del controlador
      return null;
    }
  }
}

module.exports = NotificationService;
