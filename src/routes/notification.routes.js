const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = require('../controllers/notification.controller');
const { verifyToken } = require('../middlewares/auth');

// Obtener notificaciones del usuario autenticado
router.get('/', verifyToken, getNotifications);

// Marcar una notificación como leída
router.patch('/:id/read', verifyToken, markNotificationRead);

// Marcar todas las notificaciones como leídas
router.patch('/read-all', verifyToken, markAllNotificationsRead);

module.exports = router;