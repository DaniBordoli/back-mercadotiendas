const express = require('express');
const aiController = require('../controllers/ai.controller');
const { verifyToken } = require('../middlewares/auth');

const router = express.Router();

// Protect the chat endpoint - only logged-in users can use it
router.post('/chat', verifyToken, aiController.handleChat);

module.exports = router; 