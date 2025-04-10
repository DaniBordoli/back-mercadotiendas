const router = require('express').Router();
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const testRoutes = require('./test.routes');
const firebaseAuthRoutes = require('./firebase-auth.routes');
const shopRoutes = require('./shop.routes');

// Rutas de autenticación (/api/auth/*)
router.use('/auth', authRoutes);
router.use('/auth/firebase', firebaseAuthRoutes);

// Rutas de usuario (/api/users/*)
router.use('/users', userRoutes);

// Rutas de tienda (/api/shops/*)
router.use('/shops', shopRoutes);

// Rutas de prueba (/api/test/*)
router.use('/test', testRoutes);

// Ruta de health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

module.exports = router;
