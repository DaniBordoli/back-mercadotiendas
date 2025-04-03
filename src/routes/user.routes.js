const router = require('express').Router();
const { validateRequest } = require('../middlewares/validate');
const { verifyToken } = require('../middlewares/auth');

// Importaremos estos controladores después
const {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount
} = require('../controllers/user.controller');

/**
 * @route GET /api/users/profile
 * @desc Obtener perfil del usuario
 * @access Private
 */
router.get('/profile', verifyToken, getProfile);

/**
 * @route PUT /api/users/profile
 * @desc Actualizar perfil del usuario
 * @access Private
 */
router.put('/profile', 
  verifyToken, 
  validateRequest('updateProfile'), 
  updateProfile
);

/**
 * @route PUT /api/users/password
 * @desc Cambiar contraseña
 * @access Private
 */
router.put('/password',
  verifyToken,
  validateRequest('updatePassword'),
  updatePassword
);

/**
 * @route DELETE /api/users/account
 * @desc Eliminar cuenta
 * @access Private
 */
router.delete('/account',
  verifyToken,
  validateRequest('deleteAccount'),
  deleteAccount
);

module.exports = router;
