const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.verifyGoogleToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return error(res, 'Token no proporcionado', 400);
    }

    // Verificar el token de Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    
    // Buscar usuario existente
    let user = await User.findOne({ email: payload.email });

    if (!user) {
      // Crear nuevo usuario si no existe
      user = new User({
        email: payload.email,
        name: payload.name,
        googleId: payload.sub,
        emailVerified: payload.email_verified,
        role: 'user'
      });
      await user.save();
    } else {
      // Actualizar información del usuario si es necesario
      user.googleId = payload.sub;
      user.emailVerified = payload.email_verified;
      if (payload.name && user.name !== payload.name) {
        user.name = payload.name;
      }
      await user.save();
    }

    // Generar token JWT
    const jwtToken = generateToken(user);

    return success(res, {
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
    console.error('Error en la autenticación de Google:', err);
    return error(res, 'Error en la autenticación', 500);
  }
};
