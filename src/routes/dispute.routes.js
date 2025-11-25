const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth');
const disputeController = require('../controllers/dispute.controller');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/reasons', verifyToken, disputeController.getReasons);
router.post('/', verifyToken, upload.none(), disputeController.createDispute);
router.get('/', verifyToken, disputeController.getDisputes);
router.get('/:id', verifyToken, disputeController.getDisputeById);
router.post('/:id/messages', verifyToken, upload.array('files', 3), disputeController.createMessage);
router.post('/:id/request-info', verifyToken, upload.none(), disputeController.requestInfo);
router.post('/:id/proposal', verifyToken, upload.none(), disputeController.proposal);

module.exports = router;
