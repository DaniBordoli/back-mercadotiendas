const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');
const { getSystemConfigAdmin, updateSystemConfigAdmin } = require('../controllers/systemConfig.controller');

router.use(verifyToken, requireAdmin);

router.get('/system-config', getSystemConfigAdmin);
router.patch('/system-config', updateSystemConfigAdmin);

module.exports = router;
