const express = require('express');
const router = express.Router();
const shopSocialController = require('../controllers/shopsocial.controller');

// GET redes sociales de la tienda
router.get('/:shopId', shopSocialController.getShopSocial);

// POST/PUT crear o actualizar redes sociales de la tienda
router.put('/:shopId', shopSocialController.upsertShopSocial);

module.exports = router;
