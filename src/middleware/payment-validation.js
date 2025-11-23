/**
 * Middleware para validar pagos antes de guardarlos en la base de datos
 * Asegura que todos los pagos tengan un usuario válido asociado
 */

const User = require('../models/User');

/**
 * Middleware pre-save para el modelo Payment
 * Valida que el usuario asociado al pago exista
 */
const validatePaymentUser = async function(next) {
  try {
    // Solo validar si hay un usuario asociado
    if (this.user) {
      const userExists = await User.findById(this.user);
      if (!userExists) {
        const error = new Error(`Usuario con ID ${this.user} no existe. No se puede crear el pago.`);
        error.name = 'ValidationError';
        return next(error);
      }
    } else {
      // Si no hay usuario, no permitir guardar el pago
      const error = new Error('El pago debe tener un usuario asociado.');
      error.name = 'ValidationError';
      return next(error);
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validatePaymentUser
};