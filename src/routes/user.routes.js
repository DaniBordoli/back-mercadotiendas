const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const requireAdmin = require('../middlewares/admin');
const { validateRequest } = require('../middlewares/validate');

const {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
  updateAvatar,
  followUser,
  getAdminUsersSummary,
  listAdminUsers,
  updateUserTypeAdmin,
  updateUserStatusAdmin
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

/**
 * @route PUT /api/users/avatar
 * @desc Actualizar avatar del usuario
 * @access Private
 */
router.put('/avatar',
  verifyToken,
  updateAvatar
);

router.post('/:id/follow',
  verifyToken,
  followUser
);

// Resumen de usuarios (admin)
router.get('/admin/summary', verifyToken, requireAdmin, getAdminUsersSummary);

// Administración de usuarios (admin)
router.get('/admin', verifyToken, requireAdmin, listAdminUsers);
router.patch('/admin/:id/userType', verifyToken, requireAdmin, updateUserTypeAdmin);
router.patch('/admin/:id/status', verifyToken, requireAdmin, updateUserStatusAdmin);

module.exports = router;
