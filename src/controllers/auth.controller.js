const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const crypto = require('crypto');
const { sendResetPasswordEmail } = require('../services/email.service');

const register = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 'El email ya está registrado', 400);
    }

    // Crear nuevo usuario
    const user = new User({
      fullName,
      email,
      password
    });

    // Encriptar contraseña
    user.password = await user.encryptPassword(password);
    await user.save();

    // Generar token
    const token = generateToken({ id: user._id });

    // Enviar respuesta sin la contraseña
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;

    return successResponse(res, { user: userResponse, token }, 'Usuario registrado exitosamente', 201);
  } catch (error) {
    return errorResponse(res, 'Error al registrar usuario', 500, error.message);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuario
    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, 'Credenciales inválidas', 401);
    }

    // Verificar contraseña
    const isValidPassword = await user.matchPassword(password);
    if (!isValidPassword) {
      return errorResponse(res, 'Credenciales inválidas', 401);
    }

    // Generar token
    const token = generateToken({ id: user._id });

    // Enviar respuesta sin la contraseña
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;

    return successResponse(res, { user: userResponse, token }, 'Login exitoso');
  } catch (error) {
    return errorResponse(res, 'Error al iniciar sesión', 500, error.message);
  }
};

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

    return successResponse(res, { valid: true }, 'Token válido');
  } catch (error) {
    return errorResponse(res, 'Error al verificar el token', 500, error.message);
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyResetToken
};
