const router = require('express').Router();
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const testRoutes = require('./test.routes');
const shopRoutes = require('./shop.routes');
const aiRoutes = require('./ai.routes');
const productsRoutes = require('./products.routes');
const categoryRoutes = require('./category.routes');
const subcategoryRoutes = require('./subcategory.routes');
const paymentRoutes = require('./payment.routes');
const shopSingleRoutes = require('./shop.routes');
const shopSocialRoutes = require('./shopsocial.routes');
const currencyRoutes = require('./currency.routes');
const shopInstitutionalRoutes = require('./shopInstitutional.routes');
const campaignRoutes = require('./campaign.routes');
const liveEventRoutes = require('./liveEvent.routes');
const campaignApplicationRoutes = require('./campaignApplication.routes');
const uploadRoutes = require('./upload.routes');
const influencerRoutes = require('./influencer');
const tiktokAuthRoutes = require('./tiktok.routes');
const youtubeAuthRoutes = require('./youtube.routes');

// Rutas de autenticación (/api/auth/*)
router.use('/auth', authRoutes);
// Rutas de autenticación TikTok (/api/auth/tiktok)
router.use('/auth/tiktok', tiktokAuthRoutes);
router.use('/auth/youtube', youtubeAuthRoutes);

// Rutas de usuario (/api/users/*)
router.use('/users', userRoutes);

// Rutas de tienda (/api/shops/*)
router.use('/shops', shopRoutes);

// Rutas de tienda principal (/api/shop/*)
router.use('/shop', shopSingleRoutes);

// Rutas de IA (/api/ai/*)
router.use('/ai', aiRoutes);

// Rutas de productos (/api/products/*)
router.use('/products', productsRoutes);

// Rutas de categorías (/api/categories/*)
router.use('/categories', categoryRoutes);

// Rutas de subcategorías (/api/subcategories/*)
router.use('/subcategories', subcategoryRoutes);

// Rutas de pagos (/api/payments/*)
router.use('/payments', paymentRoutes);

// Rutas de prueba (/api/test/*)
router.use('/test', testRoutes);

// Rutas de redes sociales de la tienda (/api/shopsocial/*)
router.use('/shopsocial', shopSocialRoutes);

// Rutas de monedas (/api/currencies/*)
router.use('/currencies', currencyRoutes);

// Rutas de información institucional (/api/shop-institutional/*)
router.use('/shop-institutional', shopInstitutionalRoutes);

// Rutas de campañas (/api/campaigns/*)
router.use('/campaigns', campaignRoutes);
router.use('/live-events', liveEventRoutes);

// Rutas de aplicaciones a campañas (/api/applications/*)
router.use('/applications', campaignApplicationRoutes);

// Rutas de carga de archivos (/api/uploads/*)
router.use('/uploads', uploadRoutes);

// Rutas de influencer (/api/users/* y /api/admin/influencer/*)
router.use('/', influencerRoutes);

// Ruta de health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});


module.exports = router;
