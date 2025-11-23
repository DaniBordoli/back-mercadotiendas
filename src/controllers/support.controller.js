const { validationResult } = require('express-validator');
const { sendSupportTicketEmail, sendSupportAckEmail } = require('../services/email.service');
const { errorResponse, successResponse } = require('../utils/responseHelper');
const os = require('os');
const path = require('path');

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

    return successResponse(res, { ticketId }, 'Ticket de soporte enviado');
  } catch (err) {
    console.error('[SupportTicket] error:', err);
    return errorResponse(res, 'Error al procesar ticket de soporte');
  }
};