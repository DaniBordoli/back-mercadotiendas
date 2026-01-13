const { validationResult } = require('express-validator');
const { sendSupportTicketEmail, sendSupportAckEmail } = require('../services/email.service');
const { errorResponse, successResponse } = require('../utils/responseHelper');
const SupportTicket = require('../models/SupportTicket');

/**
 * Maneja la creación de un ticket de soporte.
 * @route POST /api/support/ticket
 */
exports.createSupportTicket = async (req, res) => {
  // Validar body (express-validator ejecutado en ruta)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 'Errores de validación', 400, errors.array());
  }

  try {
    // Revisar honeypot (campo "website" debería estar vacío)
    if (req.body.website && req.body.website.trim() !== '') {
      // Posible bot – ignorar silenciosamente
      return successResponse(res, { received: true }, 'Solicitud de soporte ignorada');
    }

    // Extraer datos del formulario
    const {
      category,
      subcategory,
      priority,
      description,
      orderId,
      storeId,
      campaignId,
      email // email de contacto
    } = req.body;

    // Metadata adicional enviada como JSON string
    let metadata = {};
    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (_) {
        // Ignorar error de parseo; continuar con objeto vacío
      }
    }

    // Archivos adjuntos procesados por multer
    const attachments = (req.files || []).map((file) => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype
    }));

    // Generar ID de referencia (formato MT-SUP-XXXXXX)
    const ticketId = `MT-SUP-${Math.floor(100000 + Math.random() * 900000)}`;

    // Construir asunto y cuerpo del correo
    const shortDesc = description.substring(0, 60).replace(/\n/g, ' ');
    const subject = `[SUPPORT][${priority}][${category}] ${metadata.userId || 'anon'} - ${shortDesc}`;

    const htmlRows = [
      `<strong>Categoría:</strong> ${category} / ${subcategory || 'N/A'}`,
      `<strong>Prioridad:</strong> ${priority}`,
      `<strong>Descripción:</strong><br>${description.replace(/\n/g, '<br>')}`,
      orderId ? `<strong>Order ID:</strong> ${orderId}` : '',
      storeId ? `<strong>Store ID:</strong> ${storeId}` : '',
      campaignId ? `<strong>Campaign ID:</strong> ${campaignId}` : '',
      `<hr>`,
      `<h3>Contexto técnico</h3>`,
      `<pre>${JSON.stringify(metadata, null, 2)}</pre>`
    ].filter(Boolean);

    const html = `<div style="font-family:Arial, sans-serif">${htmlRows.join('<br>')}</div>`;
    const text = htmlRows.join('\n');

    await sendSupportTicketEmail({ subject: `${ticketId} - ${subject}`, html, text, attachments });

    // Enviar acuse de recibo al usuario si se proporcionó su email
    if (email) {
      await sendSupportAckEmail({ to: email, ticketId });
    }

    const userId = req.userId;
    const ticketPayload = {
      ticketId,
      user: userId,
      email,
      category,
      subcategory,
      priority,
      description,
      orderId,
      storeId,
      campaignId,
      metadata,
      status: 'open',
      handledBy: null,
      lastUpdateSource: 'system'
    };

    await SupportTicket.create(ticketPayload);

    return successResponse(res, { ticketId }, 'Ticket de soporte enviado');
  } catch (err) {
    console.error('[SupportTicket] error:', err);
    return errorResponse(res, 'Error al procesar ticket de soporte');
  }
};

exports.getMyTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (!ticketId) {
      return errorResponse(res, 'Falta ticketId', 400);
    }
    const ticket = await SupportTicket.findOne({ ticketId, user: req.userId });
    if (!ticket) {
      return errorResponse(res, 'Ticket no encontrado', 404);
    }
    return successResponse(res, { ticket }, 'Ticket obtenido');
  } catch (err) {
    return errorResponse(res, 'Error al obtener ticket de soporte');
  }
};

exports.listAdminTickets = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query || {};
    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (search) {
      filter.ticketId = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('handledBy', 'name fullName email')
        .lean(),
      SupportTicket.countDocuments(filter)
    ]);

    return successResponse(res, { items, total, page: pageNum, limit: limitNum }, 'Tickets obtenidos');
  } catch (err) {
    return errorResponse(res, 'Error al obtener tickets de soporte');
  }
};

exports.updateTicketStatusAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body || {};
    const allowed = ['open', 'in_review', 'resolved', 'closed'];
    if (!allowed.includes(status)) {
      return errorResponse(res, 'Estado inválido', 400);
    }
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
      return errorResponse(res, 'Ticket no encontrado', 404);
    }
    ticket.status = status;
    ticket.handledBy = req.userId;
    ticket.lastUpdateSource = 'agent';
    await ticket.save();
    return successResponse(res, { ticket }, 'Estado actualizado');
  } catch (err) {
    return errorResponse(res, 'Error al actualizar estado del ticket');
  }
};
