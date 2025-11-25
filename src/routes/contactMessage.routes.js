const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contactMessage.controller');

router.post('/', ctrl.createContactMessage);

module.exports = router;

