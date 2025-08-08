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
      .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/)
      .withMessage('La contraseña debe contener al menos una mayúscula y un carácter especial'),
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
  
  
  // Validación para crear checkout de Mobbex
  createCheckout: [
    // Validación de datos del pedido
    body('orderData')
      .notEmpty().withMessage('Los datos del pedido son requeridos')
      .isObject().withMessage('Los datos del pedido deben ser un objeto'),
    body('orderData.total')
      .notEmpty().withMessage('El monto total es requerido')
      .isNumeric().withMessage('El monto total debe ser un número')
      .custom(value => {
        if (value <= 0) {
          throw new Error('El monto total debe ser mayor a 0');
        }
        return true;
      }),
    body('orderData.description')
      .optional()
      .isString().withMessage('La descripción debe ser un texto'),
    body('orderData.reference')
      .optional()
      .isString().withMessage('La referencia debe ser un texto'),
    
    // Validación de datos del cliente
    body('customerData')
      .notEmpty().withMessage('Los datos del cliente son requeridos')
      .isObject().withMessage('Los datos del cliente deben ser un objeto'),
    body('customerData.email')
      .notEmpty().withMessage('El email del cliente es requerido')
      .isEmail().withMessage('Email inválido'),
    body('customerData.name')
      .optional()
      .isString().withMessage('El nombre debe ser un texto'),
    body('customerData.identification')
      .optional()
      .isString().withMessage('La identificación debe ser un texto'),
    
    // Validación de items
    body('items')
      .notEmpty().withMessage('Los items son requeridos')
      .isArray().withMessage('Los items deben ser un array')
      .custom(items => {
        if (items.length === 0) {
          throw new Error('Se requiere al menos un item');
        }
        return true;
      }),
    body('items.*.name')
      .notEmpty().withMessage('El nombre del item es requerido')
      .isString().withMessage('El nombre del item debe ser un texto'),
    body('items.*.price')
      .notEmpty().withMessage('El precio del item es requerido')
      .isNumeric().withMessage('El precio debe ser un número')
      .custom(value => {
        if (value <= 0) {
          throw new Error('El precio debe ser mayor a 0');
        }
        return true;
      }),
    body('items.*.quantity')
      .optional()
      .isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero mayor a 0'),
    body('items.*.description')
      .optional()
      .isString().withMessage('La descripción debe ser un texto')
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
      .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/)
      .withMessage('La contraseña debe contener al menos una mayúscula y un carácter especial')
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
      .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
      .matches(/^(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/)
      .withMessage('La contraseña debe contener al menos una mayúscula y un carácter especial')
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
  ],
  
  activateAccount: [
    body('email')
      .trim()
      .notEmpty().withMessage('El email es requerido')
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    body('activationCode')
      .trim()
      .notEmpty().withMessage('El código de activación es requerido')
      .isLength({ min: 6, max: 6 }).withMessage('El código debe tener 6 dígitos')
      .isNumeric().withMessage('El código debe contener solo números')
  ],

  createReview: [
    body('productId')
      .trim()
      .notEmpty().withMessage('El ID del producto es requerido'),
    body('comment')
      .trim()
      .notEmpty().withMessage('El comentario es requerido')
      .isLength({ min: 5, max: 500 }).withMessage('El comentario debe tener entre 5 y 500 caracteres'),
    body('rating')
      .notEmpty().withMessage('La calificación es requerida')
      .isInt({ min: 1, max: 5 }).withMessage('La calificación debe ser un número entre 1 y 5')
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
