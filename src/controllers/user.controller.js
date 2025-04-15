const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');

const getProfile = async (req, res) => {
  try {
    // Seleccionamos los campos específicos que queremos devolver
    const user = await User.findById(req.user.id)
      .select('name email birthDate city province country shop')
      .populate('shop');
    if (!user) {
      return errorResponse(res, 'Usuario no encontrado', 404);
    }

    return successResponse(res, { user }, 'Perfil obtenido exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener el perfil', 500, error.message);
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, email, birthDate, city, province, country } = req.body;

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

module.exports = {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount
};
