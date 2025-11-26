const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { getFavorites, addFavorite, removeFavorite } = require('../controllers/favorite.controller');

router.use(verifyToken);

router.get('/', getFavorites);
router.post('/', addFavorite);
router.delete('/:productId', removeFavorite);

module.exports = router;
