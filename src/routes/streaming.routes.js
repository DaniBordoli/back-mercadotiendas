const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const isInfluencer = require('../middlewares/isInfluencer');
const clipController = require('../controllers/clip.controller');

router.post('/clips/upload-url', verifyToken, isInfluencer, clipController.createUploadUrl);
router.get('/clips/mine', verifyToken, isInfluencer, clipController.getMyClips);
router.patch('/clips/:clipId', verifyToken, isInfluencer, clipController.updateClip);
router.delete('/clips/:clipId', verifyToken, isInfluencer, clipController.deleteClip);
router.get('/clips/discover', clipController.discoverClips);
router.get('/clips/by-product/:productId', clipController.getClipsByProduct);

module.exports = router;
