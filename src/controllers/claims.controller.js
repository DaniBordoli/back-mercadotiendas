const { v4: uuidv4 } = require('uuid');
const Claim = require('../models/Claim');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const cloudinaryService = require('../services/cloudinary.service');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const Payment = require('../models/Payment');
const Product = require('../models/Products');
const Shop = require('../models/Shop');

exports.createClaim = async (req, res) => {
  try {
    const raw = req.body && (req.body.data || req.body.payload);
    if (!raw) {
      return errorResponse(res, 'Falta el payload de datos', 400);
    }

    let data;
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
      return errorResponse(res, 'Formato de datos inválido', 400);
    }

    const { orderId, reference, productName, shopName, tipoProblema, descripcion } = data || {};
    if (!orderId || !reference || !productName || !tipoProblema || !descripcion) {
      return errorResponse(res, 'Campos requeridos faltantes', 400);
    }

    const filesMeta = [];
    const files = Array.isArray(req.files) ? req.files.slice(0, 3) : [];
    for (const file of files) {
      const url = await cloudinaryService.uploadFile(file.buffer, 'claims', file.mimetype);
      filesMeta.push({ originalName: file.originalname, mimeType: file.mimetype, size: file.size, url });
    }

    const claim = new Claim({
      user: req.userId,
      orderId,
      reference,
      productName,
      shopName,
      tipoProblema,
      descripcion,
      files: filesMeta
    });

    await claim.save();

    try {
      const io = req.app.get('io');
      const payment = await Payment.findById(orderId).lean();
      const buyerId = req.userId;
      let sellerId = null;
      if (payment && Array.isArray(payment.items)) {
        const matchedItem = payment.items.find((it) => (it.productName === productName) || (it.shopName === shopName));
        const item = matchedItem || payment.items[0];
        if (item && item.productId) {
          const prod = await Product.findById(item.productId).populate('shop', 'owner').lean();
          sellerId = prod && prod.shop ? prod.shop.owner : null;
        }
      }

      const commonData = { claimId: claim._id, orderId, reference, productName, shopName };
      // Notificar comprador
      await NotificationService.emitAndPersist(io, {
        users: buyerId,
        type: NotificationTypes.CLAIM,
        title: 'Reclamo creado',
        message: `Tu reclamo para ${productName} (#${reference}) fue creado.`,
        entity: claim._id,
        data: { ...commonData, role: 'buyer' }
      });
      // Notificar vendedor
      if (sellerId) {
        await NotificationService.emitAndPersist(io, {
          users: sellerId,
          type: NotificationTypes.CLAIM,
          title: 'Nuevo reclamo recibido',
          message: `Recibiste un reclamo por ${productName} (#${reference}).`,
          entity: claim._id,
          data: { ...commonData, role: 'seller' }
        });
      }
    } catch (e) {
      console.error('[Claims] notification error:', e);
    }
    return successResponse(res, { claim }, 'Reclamo creado');
  } catch (err) {
    console.error('[Claims] createClaim error:', err);
    return errorResponse(res, 'Error creando reclamo');
  }
};

exports.getClaims = async (req, res) => {
  try {
    const { orderId, reference, productName } = req.query || {};
    const filter = { user: req.userId };
    if (orderId) filter.orderId = orderId;
    if (reference) filter.reference = reference;
    if (productName) filter.productName = productName;

    const claims = await Claim.find(filter).sort({ createdAt: -1 });
    return successResponse(res, { claims }, 'Reclamos obtenidos');
  } catch (err) {
    console.error('[Claims] getClaims error:', err);
    return errorResponse(res, 'Error obteniendo reclamos');
  }
};
