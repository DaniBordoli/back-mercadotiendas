const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Obtener notificaciones de campañas para el usuario autenticado.
 * Este controlador ahora lee directamente desde la colección "notifications"
 * filtrando únicamente los tipos relacionados con campañas (offer, campaign, milestone)
 * y devuelve los resultados más recientes. De esta forma se aprovecha la
 * persistencia y se mantiene coherencia con el resto del centro de notificaciones.
 *
 * @route GET /api/campaign-notifications
 */
exports.getCampaignNotifications = async (req, res) => {
  try {
    const campaignTypes = ['offer', 'campaign', 'milestone'];

    const notifications = await Notification.find({
      user: req.user.id,
      type: { $in: campaignTypes },
    })
      .sort({ createdAt: -1 })
      .lean();

    return successResponse(res, notifications, 'Notificaciones de campaña obtenidas');
  } catch (error) {
    console.error('Error al obtener notificaciones de campañas:', error);
    return errorResponse(res, error, 'Error al obtener las notificaciones');
  }
};