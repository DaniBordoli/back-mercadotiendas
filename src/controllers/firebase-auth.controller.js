const admin = require('../config/firebase');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { sendActivationCodeEmail } = require('../services/email.service');

exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { token, userData: customUserData } = req.body;

    if (!token) {
      return errorResponse(res, 'Token no proporcionado', 400);
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    let user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      // Creamos un usuario nuevo
      const userData = {
        email: decodedToken.email,
        name: decodedToken.name || customUserData?.fullName || decodedToken.email.split('@')[0],
        fullName: customUserData?.fullName,
        birthDate: customUserData?.birthDate ? new Date(customUserData.birthDate) : undefined,
        city: customUserData?.city,
        province: customUserData?.province,
        country: customUserData?.country,
        firebaseId: decodedToken.uid,
        isActivated: decodedToken.email_verified, // Para Google, usamos la verificación de Firebase
        role: 'user'
      };
      
      // Solo agregamos el código de activación si el email no está verificado
      if (!decodedToken.email_verified) {
        const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const activationCodeExpires = new Date(Date.now() + 3600000);
        userData.activationCode = activationCode;
        userData.activationCodeExpires = activationCodeExpires;
      }
      
      user = new User(userData);
      await user.save();
      
      // Solo enviamos el correo de activación si el email no está verificado en Firebase
      if (!decodedToken.email_verified && userData.activationCode) {
        try {
          await sendActivationCodeEmail(decodedToken.email, userData.activationCode);
          console.log('Correo de activación enviado a usuario nuevo:', decodedToken.email);
        } catch (emailError) {
          console.error('Error al enviar email de activación:', emailError);
        }
      }
    } else {
      user.firebaseId = decodedToken.uid;
      // No sobrescribimos isActivated si ya está activado en nuestra base de datos
      if (!user.isActivated) {
        // Para Google, usamos la verificación de Firebase
        user.isActivated = decodedToken.email_verified;
        
        // Solo enviamos el correo si el email no está verificado en Firebase
        if (!decodedToken.email_verified) {
          const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
          user.activationCode = activationCode;
          user.activationCodeExpires = new Date(Date.now() + 3600000);
          
          try {
            await sendActivationCodeEmail(user.email, user.activationCode);
            console.log('Correo de activación enviado a usuario existente:', user.email);
          } catch (emailError) {
            console.error('Error al enviar email de activación:', emailError);
          }
        }
      }
      
      // Actualizar campos del usuario si se proporcionan en customUserData
      if (customUserData) {
        if (customUserData.fullName) {
          user.fullName = customUserData.fullName;
          // Actualizar también el nombre si no está establecido o es el email por defecto
          if (!user.name || user.name === user.email.split('@')[0]) {
            user.name = customUserData.fullName;
          }
        }
        
        if (customUserData.birthDate) {
          user.birthDate = new Date(customUserData.birthDate);
        }
        
        if (customUserData.city) {
          user.city = customUserData.city;
        }
        
        if (customUserData.province) {
          user.province = customUserData.province;
        }
        
        if (customUserData.country) {
          user.country = customUserData.country;
        }
      } else if (decodedToken.name && user.name !== decodedToken.name) {
        user.name = decodedToken.name;
      }
      await user.save();
    }

    const jwtToken = generateToken({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    });

    const userResponse = {
      id: user._id,
      email: user.email,
      name: user.name,
      fullName: user.fullName,
      birthDate: user.birthDate,
      city: user.city,
      province: user.province,
      country: user.country,
      role: user.role,
      isActivated: user.isActivated,
      shop: user.shop
    };
    
    return successResponse(res, {
      message: 'Autenticación exitosa',
      user: userResponse,
      token: jwtToken
    });

  } catch (err) {
    console.error('Error en la autenticación de Firebase:', err);
    return errorResponse(res, 'Error en la autenticación', 500);
  }
};
