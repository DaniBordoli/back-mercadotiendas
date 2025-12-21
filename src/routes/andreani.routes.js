const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { quoteAndreani, listAndreaniBranches } = require('../controllers/andreani.controller');

router.use(verifyToken);

router.post('/quote', quoteAndreani);
router.get('/branches', listAndreaniBranches);

module.exports = router;

