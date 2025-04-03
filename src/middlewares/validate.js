const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/response');

// Reglas de validación
const validationRules = {
  register: [
    body('fullName')
      .trim()
      .notEmpty().withMessage('El nombre es requerido')
      .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres'),
    body('email')
      .trim()
      .notEmpty().withMessage('El email es requerido')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    body('password')
      .trim()
      .notEmpty().withMessage('La contraseña es requerida')
      .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/)
      .withMessage('La contraseña debe contener al menos una letra y un número'),
    body('passwordConfirm')
      .trim()
      .notEmpty().withMessage('La confirmación de contraseña es requerida')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Las contraseñas no coinciden');
        }
        return true;
      })
  ],

  login: [
    body('email')
      .trim()
      .notEmpty().withMessage('El email es requerido')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    body('password')
      .trim()
      .notEmpty().withMessage('La contraseña es requerida')
  ],

  updateProfile: [
    body('fullName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres'),
    body('email')
      .optional()
      .trim()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail()
  ],

  updatePassword: [
    body('currentPassword')
      .trim()
      .notEmpty().withMessage('La contraseña actual es requerida'),
    body('newPassword')
      .trim()
      .notEmpty().withMessage('La nueva contraseña es requerida')
      .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/)
      .withMessage('La contraseña debe contener al menos una letra y un número')
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error('La nueva contraseña debe ser diferente a la actual');
        }
        return true;
      })
  ],

  resetPassword: [
    param('token')
      .trim()
      .notEmpty().withMessage('Token inválido'),
    body('password')
      .trim()
      .notEmpty().withMessage('La contraseña es requerida')
      .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/)
      .withMessage('La contraseña debe contener al menos una letra y un número')
  ],

  email: [
    body('email')
      .trim()
      .notEmpty().withMessage('El email es requerido')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail()
  ],

  deleteAccount: [
    body('password')
      .trim()
      .notEmpty().withMessage('La contraseña es requerida')
  ]
};

// Middleware de validación
const validateRequest = (validationType) => {
  if (!validationRules[validationType]) {
    throw new Error(`Validation type '${validationType}' not found`);
  }

  return [
    // Aplicar reglas de validación
    ...validationRules[validationType],
    
    // Verificar resultados
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return errorResponse(
          res,
          'Error de validación',
          400,
          errors.array().map(err => ({
            field: err.param,
            message: err.msg
          }))
        );
      }
      next();
    }
  ];
};

module.exports = {
  validateRequest
};
