const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { refreshYouTubeSubscribers } = require('../services/youtube.service');
const cloudinaryService = require('../services/cloudinary.service');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const multer = require('multer');
const AuditLog = require('../models/AuditLog');

// Configurar multer para manejar la carga de archivos en memoria
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB límite
    },
    fileFilter: (req, file, cb) => {
        // Verificar que sea una imagen
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }
        cb(null, true);
    }
}).single('avatar'); // 'avatar' es el nombre del campo en el formulario

const getProfile = async (req, res) => {
  try {
    // Seleccionamos los campos específicos que queremos devolver
  const user = await User.findById(req.user.id)
      .select('name email birthDate city province country userPhone shop avatar userType preferredAddress youtubeTokens sellerProfile influencerProfile followers')
      .populate('shop');
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    // Actualizar suscriptores de YouTube en segundo plano
    if (user.youtubeTokens) {
      refreshYouTubeSubscribers(user._id).catch(() => {});
    }

    return successResponse(res, { user }, 'Perfil obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el perfil', 500, error.message);
  }
};

const updateAvatar = async (req, res) => {
    // Manejar la carga del archivo
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return errorResponse(res, 'Error al subir el archivo: ' + err.message, 400);
        } else if (err) {
            return errorResponse(res, 'Error al procesar el archivo: ' + err.message, 400);
        }

        try {

            if (!req.file) {
                return errorResponse(res, 'No se subió ningún archivo', 400);
            }

    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

            // Si el usuario ya tenía un avatar, eliminarlo de Cloudinary
            if (user.avatar) {
                try {
                    await cloudinaryService.deleteImage(user.avatar);
                } catch (error) {
                }
            }

            // Subir el nuevo avatar a Cloudinary
            const avatarUrl = await cloudinaryService.uploadImage(req.file.buffer, 'avatars');
            
            // Actualizar la URL del avatar
            user.avatar = avatarUrl;
            await user.save();

            return successResponse(res, { avatar: user.avatar }, 'Avatar actualizado exitosamente');
        } catch (error) {
            return errorResponse(res, 'Error al actualizar el avatar', 500, error.message);
        }
    });
};

const updateProfile = async (req, res) => {
  try {
    const { name, email, birthDate, city, province, country, userPhone, userType, preferredAddress, sellerProfile, influencerProfile } = req.body;

    // Verificar si el nuevo email ya está en uso
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existingUser) {
        return errorResponse(res, 'El email ya está en uso', 400);
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    // Actualizar campos
    if (name) user.name = name;
    if (email) user.email = email;
    if (birthDate) user.birthDate = birthDate;
    if (city) user.city = city;
    if (province) user.province = province;
    if (country) user.country = country;
    if (userPhone) user.userPhone = userPhone;
    if (preferredAddress) user.preferredAddress = preferredAddress;
    if (sellerProfile) user.sellerProfile = sellerProfile;
    if (influencerProfile) user.influencerProfile = influencerProfile;
    if (userType && Array.isArray(userType)) {
      // Validar que todos los tipos sean válidos
      const validTypes = ['buyer', 'seller', 'influencer', 'admin'];
      const isValid = userType.every(type => validTypes.includes(type));
      if (isValid) {
        user.userType = userType;
      }
    }


    await user.save();

    // Enviar respuesta sin la contraseña
    const userResponse = { ...user.toJSON() };
    delete userResponse.password;

    return successResponse(res, { user: userResponse }, 'Perfil actualizado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar el perfil', 500, error.message);
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    // Verificar contraseña actual
    const isValidPassword = await user.matchPassword(currentPassword);
    if (!isValidPassword) {
      return errorResponse(res, 'Contraseña actual incorrecta', 400);
    }

    // Actualizar contraseña
    user.password = await user.encryptPassword(newPassword);
    await user.save();

    return successResponse(res, null, 'Contraseña actualizada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar la contraseña', 500, error.message);
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    // Verificar contraseña
    const isValidPassword = await user.matchPassword(password);
    if (!isValidPassword) {
      return errorResponse(res, 'Contraseña incorrecta', 400);
    }

    await User.findByIdAndDelete(req.user.id);

    return successResponse(res, null, 'Cuenta eliminada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar la cuenta', 500, error.message);
  }
};

const followUser = async (req, res) => {
  try {
    const authUserId = req.user.id;
    const { id: targetUserId } = req.params;

    if (!targetUserId) {
      return errorResponse(res, 'Usuario objetivo requerido', 400);
    }

    if (String(authUserId) === String(targetUserId)) {
      return errorResponse(res, 'No puedes seguirte a ti mismo', 400);
    }

    const [authUser, targetUser] = await Promise.all([
      User.findById(authUserId),
      User.findById(targetUserId),
    ]);

    if (!authUser) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }
    if (!targetUser) {
      return errorResponse(res, 'Usuario objetivo no encontrado', 404);
    }

    const isFollowing = (authUser.followingUsers || []).some(u => String(u) === String(targetUserId));

    if (isFollowing) {
      authUser.followingUsers = (authUser.followingUsers || []).filter(u => String(u) !== String(targetUserId));
      targetUser.followers = Math.max(0, Number(targetUser.followers || 0) - 1);
    } else {
      authUser.followingUsers = [ ...(authUser.followingUsers || []), targetUserId ];
      targetUser.followers = Number(targetUser.followers || 0) + 1;
    }

    await Promise.all([authUser.save(), targetUser.save()]);

    try {
      if (!isFollowing) {
        const io = req.app.get('io');
        const followerName = authUser.name || authUser.fullName || authUser.email || 'Un usuario';
        await NotificationService.emitAndPersist(io, {
          users: [targetUserId],
          type: NotificationTypes.FOLLOW,
          title: 'Nuevo seguidor',
          message: `${followerName} te comenzó a seguir`,
          entity: authUser._id,
          data: { followerId: authUser._id, followerName }
        });
        try {
          if (io) {
            io.to(`user_${targetUserId}`).emit('user:followersIncrement', { userId: targetUserId, amount: 1, followerName });
          }
        } catch (_) {}
      }
    } catch (_) {}

    return successResponse(
      res,
      { followed: !isFollowing, followers: targetUser.followers },
      isFollowing ? 'Dejaste de seguir al usuario' : 'Has comenzado a seguir al usuario'
    );
  } catch (err) {
    console.error('Error en follow/unfollow user:', err);
    return errorResponse(res, 'Error al procesar el seguimiento', 500, err.message);
  }
};

// Resumen de usuarios para administración
async function getAdminUsersSummary(req, res) {
  try {
    const [totalUsers, activatedUsers, sellers, influencers, admins] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActivated: true }),
      User.countDocuments({ userType: { $in: ['seller'] } }),
      User.countDocuments({ userType: { $in: ['influencer'] } }),
      User.countDocuments({ userType: { $in: ['admin'] } }),
    ]);

    return successResponse(
      res,
      { totalUsers, activatedUsers, sellers, influencers, admins },
      'Resumen de usuarios'
    );
  } catch (err) {
    return errorResponse(res, 'Error obteniendo resumen de usuarios', 500, err.message);
  }
}

async function listAdminUsers(req, res) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const filter = {};
    if (role) {
      filter.userType = { $in: [role] };
    }
    if (status === 'activated') {
      filter.isActivated = true;
    } else if (status === 'deactivated') {
      filter.isActivated = false;
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('name fullName email avatar userType isActivated shop createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('shop', 'name');

    return successResponse(res, { total, page, limit, users }, 'Listado de usuarios');
  } catch (err) {
    return errorResponse(res, 'Error al listar usuarios', 500, err.message);
  }
}

async function updateUserTypeAdmin(req, res) {
  try {
    const { id } = req.params;
    const { userType } = req.body || {};
    if (!Array.isArray(userType) || userType.length === 0) {
      return errorResponse(res, 'userType debe ser un arreglo no vacío', 400);
    }
    const validTypes = ['buyer', 'seller', 'influencer', 'admin'];
    const isValid = userType.every((t) => validTypes.includes(t));
    if (!isValid) {
      return errorResponse(res, 'Tipo de usuario inválido', 400);
    }
    const before = await User.findById(id).select('userType');
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { userType } },
      { new: true }
    ).select('name fullName email avatar userType isActivated');
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }
    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'user.userType.update',
        entityType: 'User',
        entityId: user._id,
        before: { userType: before?.userType },
        after: { userType: user.userType },
        metadata: { ip: req.ip }
      });
    } catch {}
    return successResponse(res, { user }, 'Roles de usuario actualizados');
  } catch (err) {
    return errorResponse(res, 'Error actualizando roles de usuario', 500, err.message);
  }
}

async function updateUserStatusAdmin(req, res) {
  try {
    const { id } = req.params;
    const { isActivated } = req.body || {};
    if (typeof isActivated !== 'boolean') {
      return errorResponse(res, 'isActivated debe ser booleano', 400);
    }
    const before = await User.findById(id).select('isActivated');
    const user = await User.findByIdAndUpdate(
      id,
      { $set: { isActivated } },
      { new: true }
    ).select('name fullName email avatar userType isActivated');
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }
    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'user.isActivated.update',
        entityType: 'User',
        entityId: user._id,
        before: { isActivated: before?.isActivated },
        after: { isActivated: user.isActivated },
        metadata: { ip: req.ip }
      });
    } catch {}
    return successResponse(res, { user }, 'Estado de usuario actualizado');
  } catch (err) {
    return errorResponse(res, 'Error actualizando estado de usuario', 500, err.message);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
  updateAvatar,
  followUser,
  getAdminUsersSummary
  ,
  listAdminUsers,
  updateUserTypeAdmin,
  updateUserStatusAdmin
};
