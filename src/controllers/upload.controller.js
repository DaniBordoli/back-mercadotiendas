const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Campaign } = require('../models');

// Directorio para almacenar imágenes
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const CAMPAIGNS_DIR = path.join(UPLOADS_DIR, 'campaigns');
const LIVE_EVENTS_DIR = path.join(UPLOADS_DIR, 'live-events');

// Asegurar que los directorios existan
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(CAMPAIGNS_DIR)) {
  fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
}
if (!fs.existsSync(LIVE_EVENTS_DIR)) {
  fs.mkdirSync(LIVE_EVENTS_DIR, { recursive: true });
}

exports.uploadCampaignImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ninguna imagen'
      });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(CAMPAIGNS_DIR, fileName);

    fs.writeFileSync(filePath, req.file.buffer);

    const imageUrl = `/uploads/campaigns/${fileName}`;

    // Si se proporciona un ID de campaña, actualizar la campaña con la nueva imagen
    if (req.body.campaignId) {
      const campaign = await Campaign.findById(req.body.campaignId);
      
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaña no encontrada'
        });
      }

      if (!campaign.shop.equals(req.user.shop)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para actualizar esta campaña'
        });
      }

      if (campaign.imageUrl && campaign.imageUrl.startsWith('/uploads/campaigns/')) {
        const oldImagePath = path.join(__dirname, '../..', campaign.imageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      campaign.imageUrl = imageUrl;
      await campaign.save();
    }

    res.status(200).json({
      success: true,
      imageUrl,
      message: 'Imagen subida exitosamente'
    });
  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen',
      error: error.message
    });
  }
};

exports.uploadLiveEventImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ninguna imagen'
      });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(LIVE_EVENTS_DIR, fileName);

    fs.writeFileSync(filePath, req.file.buffer);

    const imageUrl = `/uploads/live-events/${fileName}`;

    res.status(200).json({
      success: true,
      imageUrl,
      message: 'Imagen subida exitosamente'
    });
  } catch (error) {
    console.error('Error al subir imagen de evento en vivo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir la imagen',
      error: error.message
    });
  }
};
