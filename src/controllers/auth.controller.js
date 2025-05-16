const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const crypto = require('crypto');
const { sendResetPasswordEmail, sendActivationCodeEmail } = require('../services/email.service');





const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      return successResponse(res, null, 'Si el email existe, recibirás instrucciones para resetear tu contraseña');
    }

    // Generar token de reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    // Enviar email
    await sendResetPasswordEmail(user.email, resetToken);

    return successResponse(res, null, 'Instrucciones enviadas al email');
  } catch (error) {
    return errorResponse(res, 'Error al procesar la solicitud', 500, error.message);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return errorResponse(res, 'Token inválido o expirado', 400);
    }

    // Actualizar contraseña
    user.password = await user.encryptPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return successResponse(res, null, 'Contraseña actualizada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al resetear la contraseña', 500, error.message);
  }
};

const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return errorResponse(res, 'Token inválido o expirado', 400);
    }

    const responseData = { valid: true, email: user.email };
    return successResponse(res, responseData, 'Token válido');
  } catch (error) {
    return errorResponse(res, 'Error al verificar el token', 500, error.message);
  }
};

const activateAccount = async (req, res) => {
  try {
    const { email, activationCode } = req.body;

    const user = await User.findOne({
      email,
      activationCode,
      activationCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return errorResponse(res, 'Código de activación inválido o expirado', 400);
    }

    user.isActivated = true;
    user.activationCode = undefined;
    user.activationCodeExpires = undefined;
    await user.save();

    const token = generateToken({ id: user._id });

    // Enviar respuesta sin la contraseña
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;
    
    return successResponse(res, { user: userResponse, token }, 'Cuenta activada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al activar la cuenta', 500, error.message);
  }
};

const resendActivationCode = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return successResponse(res, null, 'Si el email existe, recibirás un nuevo código de activación');
    }

    if (user.isActivated) {
      return errorResponse(res, 'Esta cuenta ya está activada', 400);
    }

    const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.activationCode = activationCode;
    user.activationCodeExpires = new Date(Date.now() + 3600000);
    await user.save();

    // Enviar email con código de activación
    await sendActivationCodeEmail(email, activationCode);

    return successResponse(res, null, 'Nuevo código de activación enviado');
  } catch (error) {
    return errorResponse(res, 'Error al reenviar el código de activación', 500, error.message);
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  verifyResetToken,
  activateAccount,
  resendActivationCode
};
