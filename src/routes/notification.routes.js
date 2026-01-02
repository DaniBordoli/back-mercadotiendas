const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createLiveReminderNotification
} = require('../controllers/notification.controller');
const { verifyToken } = require('../middlewares/auth');

router.get('/', verifyToken, getNotifications);

router.patch('/:id/read', verifyToken, markNotificationRead);

router.patch('/read-all', verifyToken, markAllNotificationsRead);

router.post('/reminders/live', verifyToken, createLiveReminderNotification);

module.exports = router;
