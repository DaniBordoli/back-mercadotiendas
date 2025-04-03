const router = require('express').Router();
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const testRoutes = require('./test.routes');

// Rutas de autenticación (/api/auth/*)
router.use('/auth', authRoutes);

// Rutas de usuario (/api/users/*)
router.use('/users', userRoutes);

// Rutas de prueba (/api/test/*)
router.use('/test', testRoutes);

// Ruta de health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

module.exports = router;
