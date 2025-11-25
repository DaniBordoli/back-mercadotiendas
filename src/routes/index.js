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
const shopVisitRoutes = require('./shopVisit.routes');
const currencyRoutes = require('./currency.routes');
const shopInstitutionalRoutes = require('./shopInstitutional.routes');
const campaignRoutes = require('./campaign.routes');
const liveEventRoutes = require('./liveEvent.routes');
const productQuestionRoutes = require('./productQuestion.routes');
const productReviewRoutes = require('./productReview.routes');
const campaignApplicationRoutes = require('./campaignApplication.routes');
const campaignNotificationRoutes = require('./campaignNotification.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const supportRoutes = require('./support.routes');
const influencerRoutes = require('./influencer');
const tiktokAuthRoutes = require('./tiktok.routes');
const youtubeAuthRoutes = require('./youtube.routes');
const claimsRoutes = require('./claims.routes');
const disputeRoutes = require('./dispute.routes');
const contactMessageRoutes = require('./contactMessage.routes');

// Rutas de autenticación (/api/auth/*)
router.use('/auth', authRoutes);
// Rutas de autenticación TikTok (/api/auth/tiktok)
router.use('/auth/tiktok', tiktokAuthRoutes);
router.use('/auth/youtube', youtubeAuthRoutes);

// Rutas de usuario (/api/users/*)
router.use('/users', userRoutes);
// Rutas de preguntas de producto
router.use('/product-questions', productQuestionRoutes);
// Rutas de reseñas de producto
router.use('/product-reviews', productReviewRoutes);
// Rutas de reseñas de influencers
const influencerReviewRoutes = require('./influencerReview.routes');
router.use('/influencer-reviews', influencerReviewRoutes);
// Rutas de calificaciones de influencers
const influencerRatingRoutes = require('./influencerRating.routes');
router.use('/influencer-rating', influencerRatingRoutes);

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

// Rutas de visitas de la tienda (/api/shop-visits/*)
router.use('/shop-visits', shopVisitRoutes);

// Rutas de monedas (/api/currencies/*)
router.use('/currencies', currencyRoutes);

// Rutas de información institucional (/api/shop-institutional/*)
router.use('/shop-institutional', shopInstitutionalRoutes);

// Rutas de campañas (/api/campaigns/*)
router.use('/campaigns', campaignRoutes);
router.use('/live-events', liveEventRoutes);

// Rutas de aplicaciones a campañas (/api/applications/*)
router.use('/applications', campaignApplicationRoutes);
router.use('/campaign-notifications', campaignNotificationRoutes);
// Rutas de notificaciones (/api/notifications/*)
router.use('/notifications', notificationRoutes);

// Rutas de carga de archivos (/api/uploads/*)
router.use('/uploads', uploadRoutes);

// Rutas de soporte (/api/support/*)
router.use('/support', supportRoutes);
router.use('/claims', claimsRoutes);
router.use('/disputes', disputeRoutes);
router.use('/contact-messages', contactMessageRoutes);

// Rutas de influencer (/api/users/* y /api/admin/influencer/*)
router.use('/', influencerRoutes);

// Ruta de health check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});


module.exports = router;
