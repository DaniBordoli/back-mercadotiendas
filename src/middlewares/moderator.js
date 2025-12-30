module.exports = function(req, res, next) {
  const types = Array.isArray(req.user?.userType) ? req.user.userType.map((t) => String(t).toLowerCase()) : [];
  const canAccess = types.includes('admin') || types.includes('moderator');
  if (!req.user || !canAccess) {
    return res.status(403).json({ msg: 'Acceso denegado. Se requiere ser moderador o administrador para acceder a este recurso.' });
  }
  next();
};

