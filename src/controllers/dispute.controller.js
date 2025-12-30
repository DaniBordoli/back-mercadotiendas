const multer = require('multer');
const Dispute = require('../models/Dispute');
const DisputeMessage = require('../models/DisputeMessage');
const DisputeReason = require('../models/DisputeReason');
const Payment = require('../models/Payment');
const Product = require('../models/Products');
const Shop = require('../models/Shop');
const cloudinaryService = require('../services/cloudinary.service');
const { successResponse, errorResponse } = require('../utils/responseHelper');
const NotificationService = require('../services/notification.service');
const { NotificationTypes } = require('../constants/notificationTypes');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const ensureModeratorCanActOnDispute = (req, dispute) => {
  const rawTypes = req.userTypes || (req.user && req.user.userType) || [];
  const types = Array.isArray(rawTypes) ? rawTypes.map((t) => String(t).toLowerCase()) : [];
  const isAdmin = types.includes('admin');
  const isModerator = isAdmin || types.includes('moderator');
  if (!isModerator) {
    return { ok: false, status: 403, message: 'No autorizado' };
  }
  if (dispute.moderatorAssignedTo && String(dispute.moderatorAssignedTo) !== String(req.userId) && !isAdmin) {
    return {
      ok: false,
      status: 403,
      message: 'Solo el moderador asignado o un administrador puede realizar esta acción'
    };
  }
  return { ok: true, status: 200 };
};

exports.getReasons = async (req, res) => {
  try {
    const categoria = (req.query && req.query.categoria) || 'compras';
    let reasons = await DisputeReason.find({ categoria, activo: true }).sort({ titulo: 1 });
    if (!reasons || reasons.length === 0) {
      if (categoria === 'influencers') {
        reasons = [
          { clave: 'incumplimiento_campana', titulo: 'Incumplimiento de campaña' },
          { clave: 'rechazo_injustificado', titulo: 'Rechazo injustificado' },
          { clave: 'comision_no_liquidada', titulo: 'Comisión no liquidada' },
          { clave: 'uso_no_autorizado', titulo: 'Uso no autorizado del contenido' }
        ];
      } else {
        reasons = [
          { clave: 'no_recibido', titulo: 'No recibido' },
          { clave: 'incompleto', titulo: 'Incompleto' },
          { clave: 'danado_defectuoso', titulo: 'Dañado/defectuoso' },
          { clave: 'no_coincide', titulo: 'No coincide con descripción' },
          { clave: 'retracto', titulo: 'Retracto/Devolución' },
          { clave: 'reembolso', titulo: 'Reembolso' }
        ];
      }
    }
    return successResponse(res, { reasons });
  } catch (err) {
    return errorResponse(res, 'Error obteniendo motivos');
  }
};

exports.createDispute = async (req, res) => {
  try {
    const raw = req.body && (req.body.data || req.body.payload);
    if (!raw) return errorResponse(res, 'Falta payload', 400);
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { context = 'order', orderId, reference, productId, productName, shopName, motivoClave, descripcion, campaignId, applicationId, campaignName } = data || {};
    if (!motivoClave || !descripcion) return errorResponse(res, 'Campos requeridos faltantes', 400);

    let sellerId = null;
    let shopId = null;
    let computedReference = reference || null;
    let computedProductName = productName || null;

    if (context === 'order') {
      if (!orderId) return errorResponse(res, 'Falta orderId', 400);
      const payment = await Payment.findById(orderId).lean();
      if (!payment) return errorResponse(res, 'Orden no encontrada', 404);
      if (productId) {
        const prod = await Product.findById(productId).populate('shop', 'owner _id name').lean();
        if (prod && prod.shop) { sellerId = prod.shop.owner; shopId = prod.shop._id; }
      }
      if (!sellerId && Array.isArray(payment.items)) {
        const it = payment.items.find(i => i.productName === productName) || payment.items[0];
        if (it && it.productId) {
          const prod = await Product.findById(it.productId).populate('shop', 'owner _id name').lean();
          if (prod && prod.shop) { sellerId = prod.shop.owner; shopId = prod.shop._id; }
        }
      }
      computedReference = computedReference || (payment.reference || orderId);
      computedProductName = computedProductName || (Array.isArray(payment.items) && payment.items[0] ? payment.items[0].productName : 'Producto');
    } else if (context === 'campaign') {
      const Campaign = require('../models/Campaign');
      const Shop = require('../models/Shop');
      if (!campaignId) return errorResponse(res, 'Falta campaignId', 400);
      const camp = await Campaign.findById(campaignId).populate('shop');
      if (!camp) return errorResponse(res, 'Campaña no encontrada', 404);
      if (camp.shop) {
        const shop = await Shop.findById(camp.shop._id).select('owner name').lean();
        if (shop) { sellerId = shop.owner; shopId = camp.shop._id; }
      }
      computedReference = computedReference || `CAM-${String(campaignId).slice(-6)}`;
      computedProductName = computedProductName || campaignName || camp.name || 'Campaña';
    } else if (context === 'application') {
      const CampaignApplication = require('../models/CampaignApplication');
      const Shop = require('../models/Shop');
      if (!applicationId) return errorResponse(res, 'Falta applicationId', 400);
      const app = await CampaignApplication.findById(applicationId).populate({ path: 'campaign', populate: { path: 'shop' } });
      if (!app) return errorResponse(res, 'Postulación no encontrada', 404);
      if (app.campaign && app.campaign.shop) {
        const shop = await Shop.findById(app.campaign.shop._id).select('owner name').lean();
        if (shop) { sellerId = shop.owner; shopId = app.campaign.shop._id; }
      }
      computedReference = computedReference || `APP-${String(applicationId).slice(-6)}`;
      computedProductName = computedProductName || campaignName || (app.campaign && app.campaign.name) || 'Campaña';
    }

    const buyerId = req.userId;

    const filter = { context };
    if (context === 'order' && orderId) {
      filter.orderId = orderId;
      filter.buyerId = buyerId;
      if (productId) {
        filter.productId = productId;
      } else if (computedProductName) {
        filter.productName = computedProductName;
      }
    }
    if (context === 'campaign' && campaignId) {
      filter.campaignId = campaignId;
      filter.buyerId = buyerId;
    }
    if (context === 'application' && applicationId) {
      filter.applicationId = applicationId;
      filter.buyerId = buyerId;
    }
    if (sellerId) filter.sellerId = sellerId;
    const existing = await Dispute.findOne(filter).lean();
    if (existing) return successResponse(res, { dispute: existing }, 'Disputa existente');

    const dispute = new Dispute({ context, orderId, reference: computedReference, productId, productName: computedProductName, campaignId, applicationId, shopId, shopName, buyerId, sellerId, motivoClave, descripcionInicial: descripcion, estado: 'open', slaHoras: 72, vencimientoActual: new Date(Date.now() + 72 * 3600 * 1000) });
    await dispute.save();

    const autorRol = String(sellerId) === String(buyerId) ? 'seller' : (context === 'order' ? 'buyer' : 'influencer');
    await DisputeMessage.create({ disputeId: dispute._id, autorRol, autorId: buyerId, texto: descripcion });

    try {
      const io = req.app.get('io');
      const baseTitle = context === 'order' ? 'Disputa creada' : 'Disputa de campaña creada';
      const baseMsg = context === 'order' ? `Se abrió una disputa de la compra #${computedReference}` : `Se abrió una disputa sobre ${computedProductName}`;
      await NotificationService.emitAndPersist(io, { users: buyerId, type: NotificationTypes.DISPUTE, title: baseTitle, message: baseMsg, entity: dispute._id, data: { context, orderId, reference: computedReference, productId, productName: computedProductName, campaignId, applicationId, shopName, role: autorRol } });
      if (sellerId) {
        const sellerMsg = context === 'order' ? `Se abrió una disputa por ${computedProductName} (#${computedReference})` : `Se abrió una disputa de campaña: ${computedProductName}`;
        await NotificationService.emitAndPersist(io, { users: sellerId, type: NotificationTypes.DISPUTE, title: 'Nueva disputa', message: sellerMsg, entity: dispute._id, data: { context, orderId, reference: computedReference, productId, productName: computedProductName, campaignId, applicationId, shopName, role: 'seller' } });
      }
    } catch (_) {}

    return successResponse(res, { dispute }, 'Disputa creada');
  } catch (err) {
    return errorResponse(res, 'Error creando disputa');
  }
};

exports.getDisputes = async (req, res) => {
  try {
    const { orderId, campaignId, applicationId, context } = req.query || {};
    const userId = req.userId;
    const filter = { };
    if (context) filter.context = context;
    if (orderId) filter.orderId = orderId;
    if (campaignId) filter.campaignId = campaignId;
    if (applicationId) filter.applicationId = applicationId;
    filter.$or = [{ buyerId: userId }, { sellerId: userId }];
    const disputes = await Dispute.find(filter).sort({ createdAt: -1 });
    return successResponse(res, { disputes });
  } catch (err) {
    return errorResponse(res, 'Error obteniendo disputas');
  }
};

exports.getDisputeById = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const userId = req.userId;
    const rawTypes = (req.userTypes || (req.user && req.user.userType) || []);
    const types = Array.isArray(rawTypes) ? rawTypes.map(t => String(t).toLowerCase()) : [];
    const isModerator = types.includes('admin') || types.includes('moderator');
    if (!isModerator && String(dispute.buyerId) !== String(userId) && String(dispute.sellerId) !== String(userId)) {
      return errorResponse(res, 'No autorizado', 403);
    }
    const messages = await DisputeMessage.find({ disputeId: dispute._id }).sort({ createdAt: 1 });

    let buyerDisplay = null;
    let sellerDisplay = null;
    let shopDisplay = null;
    let productDisplay = null;
    let campaignDisplay = null;
    let moderatorDisplay = null;

    try {
      if (dispute.buyerId) {
        const buyer = await require('../models/User').findById(dispute.buyerId).lean();
        if (buyer) {
          const avatar = buyer.avatar || (buyer.influencerProfile && buyer.influencerProfile.profilePhoto) || null;
          const name = buyer.fullName || buyer.name || 'Comprador';
          buyerDisplay = { _id: buyer._id, name, avatar };
        }
      }
      if (dispute.sellerId) {
        const seller = await require('../models/User').findById(dispute.sellerId).lean();
        if (seller) {
          const avatar = seller.avatar || (seller.sellerProfile && seller.sellerProfile.logoUrl) || null;
          const name = seller.fullName || seller.name || 'Vendedor';
          sellerDisplay = { _id: seller._id, name, avatar };
        }
      }
      if (dispute.shopId) {
        const shop = await Shop.findById(dispute.shopId).lean();
        if (shop) shopDisplay = { _id: shop._id, name: shop.name, imageUrl: shop.imageUrl || null };
      }
      if (dispute.productId) {
        const prod = await Product.findById(dispute.productId).lean();
        if (prod) {
          const image = Array.isArray(prod.productImages) && prod.productImages.length > 0 ? prod.productImages[0] : null;
          productDisplay = { _id: prod._id, nombre: prod.nombre, image, precio: prod.precio };
        }
      }
      if (dispute.context === 'order') {
        if (!productDisplay) {
          const pay = await Payment.findById(dispute.orderId).lean();
          if (pay && Array.isArray(pay.items)) {
            const item = pay.items.find(i => String(i.productId) === String(dispute.productId))
              || pay.items.find(i => i.productName === dispute.productName)
              || pay.items[0];
            if (item) {
              productDisplay = { _id: item.productId, nombre: item.productName, image: item.productImage || null, precio: String(item.unitPrice) };
            }
          }
        }
      } else {
        try {
          if (dispute.campaignId) {
            const Campaign = require('../models/Campaign');
            const camp = await Campaign.findById(dispute.campaignId).lean();
            if (camp) campaignDisplay = { _id: camp._id, nombre: camp.name, image: camp.imageUrl || null };
          } else if (dispute.applicationId) {
            const CampaignApplication = require('../models/CampaignApplication');
            const app = await CampaignApplication.findById(dispute.applicationId).populate('campaign').lean();
            if (app && app.campaign) campaignDisplay = { _id: app.campaign._id, nombre: app.campaign.name, image: app.campaign.imageUrl || null };
          }
        } catch (e) {}
      }
      if (dispute.moderatorAssignedTo) {
        const mod = await User.findById(dispute.moderatorAssignedTo).lean();
        if (mod) {
          moderatorDisplay = {
            _id: mod._id,
            name: mod.fullName || mod.name || mod.email,
            email: mod.email,
            avatar: mod.avatar || null
          };
        }
      }
    } catch (_) {}

    const dto = dispute.toObject();
    dto.buyerDisplay = buyerDisplay;
    dto.sellerDisplay = sellerDisplay;
    dto.shopDisplay = shopDisplay;
    dto.productDisplay = productDisplay;
    dto.campaignDisplay = campaignDisplay;
    dto.moderatorDisplay = moderatorDisplay;

    return successResponse(res, { dispute: dto, messages });
  } catch (err) {
    return errorResponse(res, 'Error obteniendo disputa');
  }
};

exports.createMessage = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const userId = req.userId;
    const rawTypes = req.userTypes || (req.user && req.user.userType) || [];
    const types = Array.isArray(rawTypes) ? rawTypes.map((t) => String(t).toLowerCase()) : [];
    const isAdmin = types.includes('admin');
    const isModerator = isAdmin || types.includes('moderator');
    let autorRol;
    if (isModerator) {
      const guard = ensureModeratorCanActOnDispute(req, dispute);
      if (!guard.ok) return errorResponse(res, guard.message, guard.status);
      autorRol = 'moderator';
    } else {
      autorRol =
        String(dispute.sellerId) === String(userId)
          ? 'seller'
          : dispute.context === 'order'
          ? 'buyer'
          : 'influencer';
    }
    const raw = req.body && (req.body.data || req.body.payload);
    let text = '';
    if (raw) {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      text = d.text || '';
    }
    const filesMeta = [];
    const files = Array.isArray(req.files) ? req.files.slice(0, 3) : [];
    for (const file of files) {
      const url = await cloudinaryService.uploadFile(file.buffer, 'disputes', file.mimetype);
      filesMeta.push({ originalName: file.originalname, mimeType: file.mimetype, size: file.size, url });
    }
    const msg = await DisputeMessage.create({ disputeId: dispute._id, autorRol, autorId: userId, texto: text, files: filesMeta });
    dispute.vencimientoActual = new Date(Date.now() + dispute.slaHoras * 3600 * 1000);
    await dispute.save();

    try {
      const io = req.app.get('io');
      const target = autorRol === 'seller' ? dispute.buyerId : dispute.sellerId;
      const targetRole = autorRol === 'seller' ? (dispute.context === 'order' ? 'buyer' : 'influencer') : 'seller';
      await NotificationService.emitAndPersist(io, { users: target, type: NotificationTypes.DISPUTE, title: 'Nuevo mensaje en disputa', message: 'Tenés un nuevo mensaje', entity: dispute._id, data: { context: dispute.context, orderId: dispute.orderId, reference: dispute.reference, productId: dispute.productId, productName: dispute.productName, campaignId: dispute.campaignId, applicationId: dispute.applicationId, shopName: dispute.shopName, role: targetRole, disputeId: String(dispute._id) } });
      if (io) {
        const payload = { disputeId: dispute._id, message: msg };
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:message', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:message', payload);
      }
    } catch (_) {}

    return successResponse(res, { message: msg });
  } catch (err) {
    return errorResponse(res, 'Error creando mensaje');
  }
};

exports.requestInfo = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const guard = ensureModeratorCanActOnDispute(req, dispute);
    if (!guard.ok) return errorResponse(res, guard.message, guard.status);
    const { to = 'seller', text = 'Solicitamos información adicional para continuar con la revisión.' } = (req.body && (req.body.data ? (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data) : req.body)) || {};
    dispute.estado = to === 'seller' ? 'awaiting_party_b' : 'awaiting_party_a';
    dispute.vencimientoActual = new Date(Date.now() + dispute.slaHoras * 3600 * 1000);
    await dispute.save();
    const msg = await DisputeMessage.create({ disputeId: dispute._id, autorRol: 'moderator', autorId: req.userId, texto: text });
    try {
      const io = req.app.get('io');
      const targetUser = to === 'seller' ? dispute.sellerId : dispute.buyerId;
      await NotificationService.emitAndPersist(io, { users: targetUser, type: NotificationTypes.DISPUTE, title: 'Solicitud de información', message: text, entity: dispute._id, data: { orderId: dispute.orderId, reference: dispute.reference, productId: dispute.productId, productName: dispute.productName, shopName: dispute.shopName, role: to } });
      if (io) {
        const payload = { disputeId: dispute._id, dispute, message: msg };
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:updated', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:updated', payload);
      }
    } catch (_) {}
    return successResponse(res, { dispute });
  } catch (err) {
    return errorResponse(res, 'Error solicitando información');
  }
};

exports.proposal = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const guard = ensureModeratorCanActOnDispute(req, dispute);
    if (!guard.ok) return errorResponse(res, guard.message, guard.status);
    const { text = 'Propuesta de resolución generada por moderación.' } = (req.body && (req.body.data ? (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data) : req.body)) || {};
    dispute.estado = 'proposal';
    dispute.vencimientoActual = new Date(Date.now() + dispute.slaHoras * 3600 * 1000);
    await dispute.save();
    const msg = await DisputeMessage.create({ disputeId: dispute._id, autorRol: 'moderator', autorId: req.userId, texto: text });
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = { disputeId: dispute._id, dispute, message: msg };
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:updated', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:updated', payload);
      }
      await NotificationService.emitAndPersist(io, { users: dispute.buyerId, type: NotificationTypes.DISPUTE, title: 'Propuesta de resolución', message: text, entity: dispute._id, data: { orderId: dispute.orderId, reference: dispute.reference, productId: dispute.productId, productName: dispute.productName, shopName: dispute.shopName, role: 'buyer' } });
      await NotificationService.emitAndPersist(io, { users: dispute.sellerId, type: NotificationTypes.DISPUTE, title: 'Propuesta de resolución', message: text, entity: dispute._id, data: { orderId: dispute.orderId, reference: dispute.reference, productId: dispute.productId, productName: dispute.productName, shopName: dispute.shopName, role: 'seller' } });
    } catch (_) {}
    return successResponse(res, { dispute });
  } catch (err) {
    return errorResponse(res, 'Error proponiendo resolución');
  }
};

exports.proposalDecision = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const raw = (req.body && (req.body.data ? (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data) : req.body)) || {};
    const decisionRaw = String(raw.decision || '').toLowerCase();
    if (decisionRaw !== 'accept' && decisionRaw !== 'reject') {
      return errorResponse(res, 'Decisión inválida', 400);
    }
    const userId = req.userId;
    const rawTypes = req.userTypes || (req.user && req.user.userType) || [];
    const types = Array.isArray(rawTypes) ? rawTypes.map((t) => String(t).toLowerCase()) : [];
    const isAdmin = types.includes('admin');
    const isModerator = isAdmin || types.includes('moderator');
    let actorRole;
    if (isModerator) {
      actorRole = 'moderator';
    } else if (String(dispute.sellerId) === String(userId)) {
      actorRole = 'seller';
    } else if (dispute.context === 'order') {
      if (String(dispute.buyerId) === String(userId)) actorRole = 'buyer';
    } else if (String(dispute.buyerId) === String(userId)) {
      actorRole = 'influencer';
    }
    if (!actorRole) return errorResponse(res, 'No autorizado', 403);
    const estadoActual = dispute.estado || 'open';
    if (estadoActual === 'resolved' || estadoActual === 'rejected' || estadoActual === 'closed_expired') {
      return errorResponse(res, 'La disputa ya está cerrada', 400);
    }
    if (estadoActual !== 'proposal') {
      return errorResponse(res, 'No hay una propuesta de resolución activa', 400);
    }
    let targetRole = actorRole;
    const requestedRole = String(raw.role || '').toLowerCase();
    if (isModerator && (requestedRole === 'buyer' || requestedRole === 'seller')) {
      targetRole = requestedRole;
    }
    if (targetRole === 'influencer') {
      targetRole = 'buyer';
    }
    let changed = false;
    if (targetRole === 'buyer') {
      const before = dispute.proposalBuyerStatus || 'pending';
      const next = decisionRaw === 'accept' ? 'accepted' : 'rejected';
      if (before !== next) {
        dispute.proposalBuyerStatus = next;
        changed = true;
      }
    } else if (targetRole === 'seller') {
      const before = dispute.proposalSellerStatus || 'pending';
      const next = decisionRaw === 'accept' ? 'accepted' : 'rejected';
      if (before !== next) {
        dispute.proposalSellerStatus = next;
        changed = true;
      }
    } else {
      return errorResponse(res, 'Rol no soportado para esta acción', 400);
    }
    if (!changed) {
      return successResponse(res, { dispute }, 'Sin cambios en la decisión');
    }
    let closed = false;
    const buyerStatus = dispute.proposalBuyerStatus || 'pending';
    const sellerStatus = dispute.proposalSellerStatus || 'pending';
    if (buyerStatus === 'accepted' && sellerStatus === 'accepted') {
      dispute.estado = 'resolved';
      dispute.vencimientoActual = null;
      if (!dispute.cierreTipo) dispute.cierreTipo = 'Acuerdo mutuo';
      closed = true;
    } else if (decisionRaw === 'reject') {
      dispute.estado = 'in_review';
      dispute.vencimientoActual = new Date(Date.now() + (dispute.slaHoras || 72) * 3600 * 1000);
    }
    await dispute.save();
    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'dispute.proposal.decision',
        entityType: 'Dispute',
        entityId: dispute._id,
        before: null,
        after: {
          estado: dispute.estado,
          proposalBuyerStatus: dispute.proposalBuyerStatus || 'pending',
          proposalSellerStatus: dispute.proposalSellerStatus || 'pending',
          closed
        },
        metadata: {
          ip: req.ip,
          decision: decisionRaw,
          role: targetRole
        }
      });
    } catch (_) {}
    try {
      const io = req.app.get('io');
      const roleLabel =
        targetRole === 'seller'
          ? 'El vendedor'
          : dispute.context === 'order'
          ? 'El comprador'
          : 'El influencer';
      const actionLabel = decisionRaw === 'accept' ? 'aceptó' : 'rechazó';
      const baseText = `${roleLabel} ${actionLabel} la propuesta de resolución.`;
      const msg = await DisputeMessage.create({
        disputeId: dispute._id,
        autorRol: 'system',
        texto: baseText
      });
      const payload = { disputeId: dispute._id, dispute, message: msg };
      if (io) {
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:updated', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:updated', payload);
      }
      await NotificationService.emitAndPersist(io, {
        users: dispute.buyerId,
        type: NotificationTypes.DISPUTE,
        title: 'Actualización de propuesta de resolución',
        message: baseText,
        entity: dispute._id,
        data: {
          role: 'buyer',
          estado: dispute.estado
        }
      });
      await NotificationService.emitAndPersist(io, {
        users: dispute.sellerId,
        type: NotificationTypes.DISPUTE,
        title: 'Actualización de propuesta de resolución',
        message: baseText,
        entity: dispute._id,
        data: {
          role: 'seller',
          estado: dispute.estado
        }
      });
    } catch (_) {}
    const payloadOut = {
      dispute,
      proposalBuyerStatus: dispute.proposalBuyerStatus || 'pending',
      proposalSellerStatus: dispute.proposalSellerStatus || 'pending'
    };
    return successResponse(res, payloadOut, closed ? 'Propuesta aceptada por ambas partes' : 'Decisión registrada');
  } catch (err) {
    return errorResponse(res, 'Error procesando decisión sobre propuesta');
  }
};

exports.requestMediation = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const userId = req.userId;
    const rawTypes = req.userTypes || (req.user && req.user.userType) || [];
    const types = Array.isArray(rawTypes) ? rawTypes.map((t) => String(t).toLowerCase()) : [];
    const isAdmin = types.includes('admin');
    const isModerator = isAdmin || types.includes('moderator');
    let autorRol;
    if (isModerator) {
      autorRol = 'moderator';
    } else if (String(dispute.sellerId) === String(userId)) {
      autorRol = 'seller';
    } else if (dispute.context === 'order') {
      if (String(dispute.buyerId) === String(userId)) autorRol = 'buyer';
    } else if (String(dispute.buyerId) === String(userId)) {
      autorRol = 'influencer';
    }
    if (!autorRol) return errorResponse(res, 'No autorizado', 403);
    const estadoActual = dispute.estado || 'open';
    if (estadoActual === 'resolved' || estadoActual === 'rejected' || estadoActual === 'closed_expired') {
      return errorResponse(res, 'La disputa ya está cerrada y no puede escalarse', 400);
    }
    if (estadoActual !== 'open') {
      return errorResponse(res, 'Ya existe una solicitud de mediación o intervención en curso', 400);
    }
    if (estadoActual === 'open') {
      dispute.estado = 'in_review';
      dispute.vencimientoActual = new Date(Date.now() + (dispute.slaHoras || 72) * 3600 * 1000);
    }
    await dispute.save();
    const quien =
      autorRol === 'seller'
        ? 'El vendedor'
        : autorRol === 'buyer'
        ? 'El comprador'
        : autorRol === 'influencer'
        ? 'El influencer'
        : 'El moderador';
    const texto = `${quien} solicitó intervención. Responder con evidencia o propuesta.`;
    const msg = await DisputeMessage.create({
      disputeId: dispute._id,
      autorRol: 'moderator',
      autorId: isModerator ? userId : null,
      texto
    });
    try {
      const io = req.app.get('io');
      const payload = { disputeId: dispute._id, dispute, message: msg };
      if (io) {
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:updated', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:updated', payload);
      }
      const mods = await User.find({
        userType: { $in: ['moderator', 'admin'] },
        isActivated: true
      })
        .select('_id')
        .lean();
      const modIds = mods.map((u) => u._id);
      if (modIds.length > 0) {
        const baseTitle = 'Solicitud de ayuda en disputa';
        const baseMsg = `${quien} pidió ayuda de Tuki en una disputa.`;
        const data = {
          disputeId: dispute._id,
          context: dispute.context,
          orderId: dispute.orderId,
          reference: dispute.reference,
          productId: dispute.productId,
          productName: dispute.productName,
          campaignId: dispute.campaignId,
          applicationId: dispute.applicationId,
          shopName: dispute.shopName,
          role: autorRol
        };
        await NotificationService.emitAndPersist(io, {
          users: modIds,
          type: NotificationTypes.DISPUTE,
          title: baseTitle,
          message: baseMsg,
          entity: dispute._id,
          data
        });
      }
    } catch (_) {}
    return successResponse(res, { dispute, message: msg }, 'Solicitud de mediación registrada');
  } catch (err) {
    return errorResponse(res, 'Error solicitando mediación');
  }
};

exports.listAdminDisputes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
    const { context, estado, reference, buyerEmail, sellerEmail, motivo, fromDate, toDate, dueSoonOnly, expiredOnly, moderator } = req.query || {};

    const filter = {};
    if (context) filter.context = context;
    if (estado) filter.estado = estado;
    if (reference) filter.reference = reference;
    if (motivo) filter.motivoClave = motivo;
    if (moderator === 'none') {
      filter.$or = [
        { moderatorAssignedTo: { $exists: false } },
        { moderatorAssignedTo: null }
      ];
    } else if (moderator) {
      filter.moderatorAssignedTo = moderator;
    }

    // Fecha de creación
    if (fromDate || toDate) {
      const range = {};
      if (fromDate) {
        const d = new Date(fromDate);
        if (!isNaN(d.getTime())) range.$gte = d;
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!isNaN(d.getTime())) range.$lte = d;
      }
      if (Object.keys(range).length > 0) {
        filter.createdAt = range;
      }
    }

    let buyerIds = null;
    let sellerIds = null;
    try {
      if (buyerEmail && typeof buyerEmail === 'string' && buyerEmail.trim() !== '') {
        const users = await require('../models/User').find({ email: new RegExp(`^${buyerEmail}`, 'i') }).select('_id');
        buyerIds = users.map(u => u._id);
      }
      if (sellerEmail && typeof sellerEmail === 'string' && sellerEmail.trim() !== '') {
        const users = await require('../models/User').find({ email: new RegExp(`^${sellerEmail}`, 'i') }).select('_id');
        sellerIds = users.map(u => u._id);
      }
    } catch (_) {}

    if (buyerIds && buyerIds.length > 0) filter.buyerId = { $in: buyerIds };
    if (sellerIds && sellerIds.length > 0) filter.sellerId = { $in: sellerIds };

    // Próximas a vencer (<24h) y vencidas
    const wantDueSoon = String(dueSoonOnly || '').toLowerCase() === 'true';
    const wantExpired = String(expiredOnly || '').toLowerCase() === 'true';
    if (wantDueSoon || wantExpired) {
      const now = new Date();
      const soon = new Date(Date.now() + 24 * 3600 * 1000);
      if (wantDueSoon && wantExpired) {
        filter.$or = [
          { vencimientoActual: { $gte: now, $lte: soon } },
          { vencimientoActual: { $lt: now } },
        ];
      } else if (wantDueSoon) {
        filter.vencimientoActual = { $gte: now, $lte: soon };
      } else if (wantExpired) {
        filter.vencimientoActual = { $lt: now };
      }
    }

    const total = await Dispute.countDocuments(filter);
    const disputes = await Dispute.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const userIds = [];
    disputes.forEach(d => {
      if (d.buyerId) userIds.push(d.buyerId);
      if (d.sellerId) userIds.push(d.sellerId);
    });
    let usersMap = new Map();
    if (userIds.length > 0) {
      try {
        const users = await require('../models/User').find({ _id: { $in: userIds } }).select('_id name fullName email avatar').lean();
        usersMap = new Map(users.map(u => [String(u._id), u]));
      } catch (_) {}
    }

    const moderatorIds = disputes
      .map((d) => (d.moderatorAssignedTo ? d.moderatorAssignedTo : null))
      .filter((id, index, arr) => !!id && arr.findIndex((x) => String(x) === String(id)) === index);

    let moderatorsMap = new Map();
    if (moderatorIds.length > 0) {
      try {
        const moderators = await User.find({ _id: { $in: moderatorIds } })
          .select('_id name fullName email avatar userType')
          .lean();
        moderatorsMap = new Map(moderators.map((u) => [String(u._id), u]));
      } catch (_) {}
    }

    const payload = disputes.map(d => {
      const dto = { ...d };
      const buyer = d.buyerId ? usersMap.get(String(d.buyerId)) : null;
      const seller = d.sellerId ? usersMap.get(String(d.sellerId)) : null;
      dto.buyerDisplay = buyer ? { _id: buyer._id, name: buyer.name || buyer.fullName || buyer.email, email: buyer.email, avatar: buyer.avatar || null } : null;
      dto.sellerDisplay = seller ? { _id: seller._id, name: seller.name || seller.fullName || seller.email, email: seller.email, avatar: seller.avatar || null } : null;
      if (d.moderatorAssignedTo) {
        const mod = moderatorsMap.get(String(d.moderatorAssignedTo));
        if (mod) {
          dto.moderatorDisplay = {
            _id: mod._id,
            name: mod.fullName || mod.name || mod.email,
            email: mod.email,
            avatar: mod.avatar || null
          };
        }
      }
      return dto;
    });

    return successResponse(res, { total, page, limit, disputes: payload }, 'Listado de disputas');
  } catch (err) {
    return errorResponse(res, 'Error listando disputas');
  }
};

exports.updateDisputeModeratorAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { moderatorKey, moderatorUserId } = req.body || {};

    const dispute = await Dispute.findById(id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const guard = ensureModeratorCanActOnDispute(req, dispute);
    if (!guard.ok) return errorResponse(res, guard.message, guard.status);

    let assignedUserId = null;
    if (moderatorUserId) {
      const user = await User.findById(moderatorUserId).select('_id userType');
      if (!user) return errorResponse(res, 'Usuario moderador no encontrado', 404);
      const types = Array.isArray(user.userType) ? user.userType : [];
      const lowered = types.map((t) => String(t).toLowerCase());
      const canModerate = lowered.includes('admin') || lowered.includes('moderator');
      if (!canModerate) {
        return errorResponse(res, 'El usuario seleccionado no tiene permisos de moderador', 400);
      }
      assignedUserId = user._id;
    }

    const before = { moderatorKey: dispute.moderatorKey || null, moderatorAssignedTo: dispute.moderatorAssignedTo || null };
    dispute.moderatorKey = moderatorKey || null;
    dispute.moderatorAssignedTo = assignedUserId;
    await dispute.save();

    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'dispute.moderator.update',
        entityType: 'Dispute',
        entityId: dispute._id,
        before,
        after: { moderatorKey: dispute.moderatorKey || null, moderatorAssignedTo: dispute.moderatorAssignedTo || null },
        metadata: { ip: req.ip }
      });
    } catch (_) {}

    return successResponse(res, { dispute }, 'Moderador de disputa actualizado');
  } catch (err) {
    return errorResponse(res, 'Error actualizando moderador de disputa');
  }
};

exports.updateDisputeStateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, cierreTipo, comentario } = req.body || {};
    const allowed = ['open','in_review','awaiting_party_a','awaiting_party_b','proposal','resolved','closed_expired','rejected','escalated'];
    if (!allowed.includes(String(estado))) {
      return errorResponse(res, 'Estado inválido', 400);
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) return errorResponse(res, 'Disputa no encontrada', 404);
    const guard = ensureModeratorCanActOnDispute(req, dispute);
    if (!guard.ok) return errorResponse(res, guard.message, guard.status);

    const before = { estado: dispute.estado, cierreTipo: dispute.cierreTipo };
    dispute.estado = estado;
    if (cierreTipo !== undefined) dispute.cierreTipo = cierreTipo;
    if (estado === 'awaiting_party_a' || estado === 'awaiting_party_b' || estado === 'proposal' || estado === 'in_review') {
      dispute.vencimientoActual = new Date(Date.now() + (dispute.slaHoras || 72) * 3600 * 1000);
    }
    if (estado === 'resolved' || estado === 'rejected' || estado === 'closed_expired') {
      dispute.vencimientoActual = null;
    }
    await dispute.save();

    try {
      await AuditLog.create({
        actor: req.user.id,
        action: 'dispute.estado.update',
        entityType: 'Dispute',
        entityId: dispute._id,
        before,
        after: { estado: dispute.estado, cierreTipo: dispute.cierreTipo },
        metadata: { ip: req.ip }
      });
    } catch (_) {}

    try {
      const io = req.app.get('io');
      const msgText = comentario || `Estado actualizado a "${estado}"`;
      await DisputeMessage.create({ disputeId: dispute._id, autorRol: 'moderator', autorId: req.userId, texto: msgText });
      const payload = { disputeId: dispute._id, dispute };
      if (io) {
        if (dispute.buyerId) io.to(String(dispute.buyerId)).emit('dispute:updated', payload);
        if (dispute.sellerId) io.to(String(dispute.sellerId)).emit('dispute:updated', payload);
      }
      await NotificationService.emitAndPersist(io, { users: dispute.buyerId, type: NotificationTypes.DISPUTE, title: 'Actualización de disputa', message: msgText, entity: dispute._id, data: { role: 'buyer', estado: dispute.estado } });
      await NotificationService.emitAndPersist(io, { users: dispute.sellerId, type: NotificationTypes.DISPUTE, title: 'Actualización de disputa', message: msgText, entity: dispute._id, data: { role: 'seller', estado: dispute.estado } });
    } catch (_) {}

    return successResponse(res, { dispute }, 'Estado de disputa actualizado');
  } catch (err) {
    return errorResponse(res, 'Error actualizando disputa');
  }
};
