/**
 * Middleware para verificar si el usuario es influencer
 * Se usa para proteger rutas que solo deben ser accesibles por influencers
 */
module.exports = function(req, res, next) {
  // Verificar que el usuario está autenticado y es influencer
  if (!req.user || !req.user.userType?.includes('influencer')) {
    return res.status(403).json({ msg: 'Acceso denegado. Se requiere ser influencer para acceder a este recurso.' });
  }
  
  next();
};
