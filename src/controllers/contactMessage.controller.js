const { successResponse, errorResponse } = require('../utils/response');
const Shop = require('../models/Shop');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');

exports.createContactMessage = async (req, res) => {
  try {
    const { shopId, name, email, message } = req.body || {};
    if (!shopId || !name || !email || !message) {
      return errorResponse(res, 'Faltan campos requeridos', 400);
    }

    const shop = await Shop.findById(shopId).select('owner name').lean();
    if (!shop || !shop.owner) {
      return errorResponse(res, 'Tienda no encontrada', 404);
    }

    try {
      const io = req.app.get('io');
      await NotificationService.emitAndPersist(io, {
        users: [shop.owner],
        type: NotificationTypes.CONTACT_MESSAGE,
        title: 'Nuevo mensaje de contacto',
        message: `Mensaje de ${name}`,
        entity: shopId,
        data: { name, email, message, shopName: shop.name || '' }
      });
    } catch (_) {}

    return successResponse(res, { received: true }, 'Mensaje enviado');
  } catch (err) {
    return errorResponse(res, 'Error al enviar mensaje de contacto', 500, err.message);
  }
};

