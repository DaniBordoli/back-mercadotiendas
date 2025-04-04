const admin = require('../config/firebase');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return error(res, 'Token no proporcionado', 400);
    }

    // Verificar el token con Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Buscar usuario existente
    let user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      // Crear nuevo usuario si no existe
      user = new User({
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split('@')[0],
        firebaseUid: decodedToken.uid,
        emailVerified: decodedToken.email_verified,
        role: 'user'
      });
      await user.save();
    } else {
      // Actualizar información del usuario si es necesario
      user.firebaseUid = decodedToken.uid;
      user.emailVerified = decodedToken.email_verified;
      if (decodedToken.name && user.name !== decodedToken.name) {
        user.name = decodedToken.name;
      }
      await user.save();
    }

    // Generar token JWT
    const token = generateToken(user);

    return success(res, {
      message: 'Autenticación exitosa',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    });

  } catch (err) {
    console.error('Error en la autenticación de Firebase:', err);
    return error(res, 'Error en la autenticación', 500);
  }
};
