const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/auth');
const requireModerator = require('../middlewares/moderator');
const disputeController = require('../controllers/dispute.controller');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/reasons', verifyToken, disputeController.getReasons);
router.post('/', verifyToken, upload.none(), disputeController.createDispute);
router.get('/', verifyToken, disputeController.getDisputes);
// Rutas de administración de disputas (moderación y administración)
router.get('/admin', verifyToken, requireModerator, disputeController.listAdminDisputes);
router.patch('/admin/:id/state', verifyToken, requireModerator, disputeController.updateDisputeStateAdmin);
router.patch('/admin/:id/moderator', verifyToken, requireModerator, disputeController.updateDisputeModeratorAdmin);

router.get('/:id', verifyToken, disputeController.getDisputeById);
router.post('/:id/messages', verifyToken, upload.array('files', 3), disputeController.createMessage);
router.post('/:id/request-info', verifyToken, upload.none(), disputeController.requestInfo);
router.post('/:id/proposal', verifyToken, upload.none(), disputeController.proposal);
router.post('/:id/proposal/decision', verifyToken, upload.none(), disputeController.proposalDecision);
router.post('/:id/mediation', verifyToken, upload.none(), disputeController.requestMediation);

module.exports = router;
