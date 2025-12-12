const express = require('express');
const router = express.Router();
const { listAdminAuditLogs } = require('../controllers/audit.controller');
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');

router.get('/admin', verifyToken, requireAdmin, listAdminAuditLogs);

module.exports = router;
