const Notification = require('../models/Notification');

const emitNotification = async (io, userId, { type, title, message = '', entity = null, data = {} }) => {
  if (!userId) {
    throw new Error('userId es requerido para emitir una notificación');
  }

  const notificationDoc = await Notification.create({
    user: userId,
    type,
    title,
    message,
    entity,
    data,
  });

  if (io) {
    io.to(`user_${userId}`).emit('notification:new', {
      id: notificationDoc._id,
      user: notificationDoc.user,
      type: notificationDoc.type,
      title: notificationDoc.title,
      message: notificationDoc.message,
      entity: notificationDoc.entity,
      data: notificationDoc.data,
      isRead: notificationDoc.isRead,
      createdAt: notificationDoc.createdAt,
    });
  }

  return notificationDoc;
};

module.exports = {
  emitNotification,
};