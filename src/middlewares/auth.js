const { verifyToken } = require('../utils/jwt');
const { errorResponse } = require('../utils/response');
const User = require('../models/User');

const verifyTokenMiddleware = async (req, res, next) => {
  try {
    // Obtener el token del header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return errorResponse(res, 'No token provided', 401);
    }

    // Verificar formato del token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return errorResponse(res, 'Token error', 401);
    }

    const token = parts[1];

    // Verificar validez del token
    const decoded = verifyToken(token);
    if (!decoded) {
      return errorResponse(res, 'Invalid token', 401);
    }

    // Verificar que el usuario existe
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return errorResponse(res, 'User not found', 401);
    }

    // Agregar usuario al request
    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 'Authentication failed', 500, error.message);
  }
};

module.exports = {
  verifyToken: verifyTokenMiddleware
};
