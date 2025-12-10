/**
 * Middleware para verificar si el usuario es influencer
 * Se usa para proteger rutas que solo deben ser accesibles por influencers
 */
module.exports = function(req, res, next) {
  const types = Array.isArray(req.user?.userType) ? req.user.userType.map(t => String(t).toLowerCase()) : [];
  const canAccess = types.includes('influencer') || types.includes('seller') || types.includes('vendedor');
  if (!req.user || !canAccess) {
    return res.status(403).json({ msg: 'Acceso denegado. Se requiere ser influencer o vendedor para acceder a este recurso.' });
  }
  next();
};
