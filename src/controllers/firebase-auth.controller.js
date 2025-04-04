const admin = require('../config/firebase');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');

exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return errorResponse(res, 'Token no proporcionado', 400);
    }

    // Verificar el token con Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Buscar usuario existente
    let user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      // Crear nuevo usuario si no existe
      user = new User({
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split('@')[0],
        firebaseId: decodedToken.uid,
        emailVerified: decodedToken.email_verified,
        role: 'user'
      });
      await user.save();
    } else {
      // Actualizar información del usuario si es necesario
      user.firebaseId = decodedToken.uid;
      user.emailVerified = decodedToken.email_verified;
      if (decodedToken.name && user.name !== decodedToken.name) {
        user.name = decodedToken.name;
      }
      await user.save();
    }

    // Generar token JWT
    const jwtToken = generateToken({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    });

    return successResponse(res, {
      message: 'Autenticación exitosa',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token: jwtToken
    });

  } catch (err) {
    console.error('Error en la autenticación de Firebase:', err);
    return errorResponse(res, 'Error en la autenticación', 500);
  }
};
