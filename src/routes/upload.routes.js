const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadCampaignImage, uploadLiveEventImage } = require('../controllers/upload.controller');
const { verifyToken } = require('../middlewares/auth');
// TODO: Implementar middleware de propietario de tienda

// Configuración de multer para almacenar archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

router.post(
  '/campaign',
  verifyToken,
  // shopOwnerMiddleware, // Comentado temporalmente hasta implementar el middleware
  upload.single('image'),
  uploadCampaignImage
);

router.post(
  '/live-events',
  verifyToken,
  upload.single('image'),
  uploadLiveEventImage
);

module.exports = router;
