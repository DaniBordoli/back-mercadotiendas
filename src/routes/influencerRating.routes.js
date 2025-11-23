const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const ratingCtrl = require('../controllers/influencerRating.controller');

// Verificar si una campaña/influencer es calificable
router.get('/campaign/:campaignId/influencer/:influencerId/is-rateable', verifyToken, ratingCtrl.isRateable);
router.post('/campaign/:campaignId/influencer/:influencerId', verifyToken, ratingCtrl.createRating);

module.exports = router;