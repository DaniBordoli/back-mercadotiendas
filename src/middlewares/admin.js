/**
 * Middleware para verificar si el usuario es administrador
 * Se usa para proteger rutas que solo deben ser accesibles por administradores
 */
module.exports = function(req, res, next) {
  // Verificar que el usuario está autenticado y es administrador
  if (!req.user || !req.user.userType?.includes('admin')) {
    return res.status(403).json({ msg: 'Acceso denegado. Se requiere ser administrador para acceder a este recurso.' });
  }
  
  next();
};
