const admin = require('firebase-admin');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { config } = require('../config');

// Inicializar Firebase Admin si no está inicializado
if (!admin.apps.length) {
  const serviceAccount = require(`../config/firebase-service-account${config.isDevelopment ? '-dev' : '-prod'}.json`);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

exports.verifyGoogleToken = async (req, res) => {
  console.log('Received request to verify Google token');
  try {
    const { token } = req.body;
    console.log('Request body:', { tokenLength: token ? token.length : 0 });
    
    // Decodificar el token sin verificar para ver su contenido
    const tokenParts = token.split('.');
    const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
    const decodedPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    console.log('Token header:', header);
    console.log('Token payload:', decodedPayload);
    console.log('Token aud (Client ID):', decodedPayload.aud);

    if (!token) {
      console.log('No token provided in request');
      return errorResponse(res, 'Token no proporcionado', 400);
    }

    console.log('Google Client ID:', config.googleClientId);
    // Verificar el token de Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Token verified successfully');
    console.log('Decoded token:', {
      email: decodedToken.email,
      name: decodedToken.name,
      uid: decodedToken.uid,
      email_verified: decodedToken.email_verified
    });
    
    // Buscar usuario existente
    let user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      // Crear nuevo usuario si no existe
      user = new User({
        email: decodedToken.email,
        name: decodedToken.name,
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
    const tokenPayload = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    const jwtToken = generateToken(tokenPayload);

    return successResponse(res, {
      message: 'Autenticación exitosa',
      user: tokenPayload,
      token: jwtToken
    });

  } catch (err) {
    console.error('Error en la autenticación de Google:', err);
    console.error('Error details:', {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({
      success: false,
      message: `Error en la autenticación: ${err.message}`
    });
  }
};
