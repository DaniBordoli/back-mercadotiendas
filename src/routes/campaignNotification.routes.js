const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const campaignNotificationController = require('../controllers/campaignNotification.controller');

// GET /api/campaign-notifications
router.get('/', verifyToken, campaignNotificationController.getCampaignNotifications);

module.exports = router;