const admin = require('../config/firebase');
const User = require('../models/User');
const { generateToken, generateRefreshToken, generateAccessToken } = require('../utils/jwt');
const { successResponse, errorResponse } = require('../utils/response');
const { sendActivationCodeEmail } = require('../services/email.service');
const disableEmailVerification = process.env.DISABLE_EMAIL_VERIFICATION === 'true';

exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { token, userData: customUserData } = req.body;

    if (!token) {
      return errorResponse(res, 'Token no proporcionado', 400);
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    let user = await User.findOne({ $or: [{ email: decodedToken.email }, { firebaseId: decodedToken.uid }] });

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
        isActivated: disableEmailVerification ? true : decodedToken.email_verified, // Auto-activate if bypass is enabled
        userType: ['buyer']
      };
      
      // Solo agregamos el código de activación si el email no está verificado y el bypass no está activo
      if (!disableEmailVerification && !decodedToken.email_verified) {
        const activationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const activationCodeExpires = new Date(Date.now() + 3600000);
        userData.activationCode = activationCode;
        userData.activationCodeExpires = activationCodeExpires;
      }
      
      user = new User(userData);
      await user.save();
      
      // Solo enviamos el correo de activación si el email no está verificado y no se ha deshabilitado la verificación por email
      if (!disableEmailVerification && !decodedToken.email_verified && userData.activationCode) {
        try {
          await sendActivationCodeEmail(decodedToken.email, userData.activationCode);
          console.log('Correo de activación enviado a usuario nuevo:', decodedToken.email);
        } catch (emailError) {
          console.error('Error al enviar email de activación:', emailError);
        }
      }
    } else {
      user.firebaseId = decodedToken.uid;

      if (!user.isActivated) {
        const shouldActivate = disableEmailVerification || decodedToken.email_verified;
        user.isActivated = shouldActivate;

        // Si aún no está activado y no se ha deshabilitado la verificación por email, generamos y enviamos el código
        if (!shouldActivate) {
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

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mercadotiendas.com';
    if (String(user.email || '').toLowerCase() === String(adminEmail || '').toLowerCase()) {
      const types = Array.from(new Set([...(user.userType || []), 'admin']));
      user.userType = types;
      user.isActivated = true;
      await user.save();
    }

    // Generar tokens de acceso y refresco
    const accessToken = generateAccessToken({
      id: user._id,
      email: user.email,
      name: user.name,
      userType: user.userType
    });
    const refreshToken = generateRefreshToken({ id: user._id });

    // Almacenar refreshToken en el usuario
    user.refreshToken = refreshToken;
    await user.save();

    // Token de un día para operaciones no críticas (opcional)
    const jwtToken = generateToken({
      id: user._id,
      email: user.email,
      name: user.name,
      userType: user.userType
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
      userType: user.userType,
      isActivated: user.isActivated,
      shop: user.shop
    };
    
    return successResponse(res, {
      message: 'Autenticación exitosa',
      user: userResponse,
      token: accessToken,
      refreshToken
    });

  } catch (err) {
    console.error('Error en la autenticación de Firebase:', err);
    return errorResponse(res, 'Error en la autenticación', 500);
  }
};
