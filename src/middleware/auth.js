const { verifyToken } = require('../utils/jwt');
const { errorResponse } = require('../utils/response');

exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Token no proporcionado', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return errorResponse(res, 'Token inválido', 401);
    }

    // Agregar el usuario decodificado al request
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Error en autenticación:', err);
    return errorResponse(res, 'Error en autenticación', 401);
  }
};
