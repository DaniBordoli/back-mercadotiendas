const { CampaignApplication, Campaign, User } = require('../models');

/**
 * Obtener notificaciones de campañas para la tienda del usuario autenticado
 * Agrupa las postulaciones (CampaignApplication) de las campañas pertenecientes a la tienda
 * y genera un formato simplificado para las notificaciones del panel.
 *
 * Estado -> tipo
 *  - pending   -> "offer"      (nueva oferta)
 *  - accepted  -> "campaign"   (oferta aceptada)
 *  - rejected  -> "campaign"   (oferta rechazada)
 *
 * @route GET /api/campaign-notifications
 */
exports.getCampaignNotifications = async (req, res) => {
  try {
    // Obtener usuario y su tienda
    const user = await User.findById(req.user.id).populate('shop');
    if (!user || !user.shop) {
      return res.status(404).json({ success: false, message: 'El usuario no posee una tienda' });
    }

    // Obtener campañas de la tienda
    const campaigns = await Campaign.find({ shop: user.shop._id }).select('_id name');
    const campaignMap = new Map(campaigns.map((c) => [c._id.toString(), c.name]));
    const campaignIds = Array.from(campaignMap.keys());

    // Obtener aplicaciones de esas campañas
    const applications = await CampaignApplication.find({ campaign: { $in: campaignIds } })
      .populate('user', 'name')
      .sort({ updatedAt: -1 });

    const notifications = applications.map((app) => {
      let type = 'campaign';
      let title;
      let description;

      switch (app.status) {
        case 'pending':
          type = 'offer';
          title = `Nueva oferta en "${campaignMap.get(app.campaign.toString())}"`;
          description = `${app.user.name} envió una propuesta`;
          break;
        case 'accepted':
          title = `Oferta aceptada en "${campaignMap.get(app.campaign.toString())}"`;
          description = `Has aceptado la propuesta de ${app.user.name}`;
          break;
        case 'rejected':
          title = `Oferta rechazada en "${campaignMap.get(app.campaign.toString())}"`;
          description = `Has rechazado la propuesta de ${app.user.name}`;
          break;
        default:
          title = `Actualización en "${campaignMap.get(app.campaign.toString())}"`;
          description = `Propuesta de ${app.user.name}`;
      }

      return {
        id: app._id,
        title,
        description,
        amount: app.totalAmount ? `$${app.totalAmount.toFixed(2)}` : '$0.00',
        milestones: app.milestones ? app.milestones.length : 0,
        time: app.updatedAt,
        isRead: false, // TODO: almacenar estado leído/ no leído en el futuro
        campaignName: campaignMap.get(app.campaign.toString()),
        influencerName: app.user.name,
        type
      };
    });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error al obtener notificaciones de campañas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener las notificaciones', error: error.message });
  }
};