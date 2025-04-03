const router = require('express').Router();
const { validateRequest } = require('../middlewares/validate');
const { verifyToken } = require('../middlewares/auth');

// Importaremos estos controladores después
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyResetToken,
} = require('../controllers/auth.controller');

/**
 * @route POST /api/auth/register
 * @desc Registrar un nuevo usuario
 * @access Public
 */
router.post('/register', validateRequest('register'), register);

/**
 * @route POST /api/auth/login
 * @desc Login de usuario
 * @access Public
 */
router.post('/login', validateRequest('login'), login);

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar reset de contraseña
 * @access Public
 */
router.post('/forgot-password', validateRequest('email'), forgotPassword);

/**
 * @route POST /api/auth/reset-password/:token
 * @desc Reset de contraseña con token
 * @access Public
 */
router.post('/reset-password/:token', validateRequest('resetPassword'), resetPassword);

/**
 * @route GET /api/auth/verify-reset-token/:token
 * @desc Verificar si un token de reset es válido
 * @access Public
 */
router.get('/verify-reset-token/:token', verifyResetToken);

module.exports = router;
