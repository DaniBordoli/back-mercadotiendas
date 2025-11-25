const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth');
const claimsController = require('../controllers/claims.controller');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/', verifyToken, upload.array('files', 3), claimsController.createClaim);
router.get('/', verifyToken, claimsController.getClaims);

module.exports = router;

