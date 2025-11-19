const nodemailer = require('nodemailer');
const { config } = require('../config');

const transporter = nodemailer.createTransport({
  host: config.emailService.host,
  port: config.emailService.port,
  secure: config.emailService.port === 465,
  auth: {
    user: config.emailService.user,
    pass: config.emailService.pass
  }
});

const sendResetPasswordEmail = async (email, token) => {
  const frontendUrl = process.env.FRONTEND_URL.replace(/\/+$/, '');
  const resetUrl = `${frontendUrl}/password-restore?token=${token}`;

  const mailOptions = {
    from: `"MercadoTiendas" <${config.emailService.user}>`,
    to: email,
    subject: 'Recuperación de Contraseña',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h1 style="color: #333; text-align: center;">Recuperación de Contraseña</h1>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz click en el siguiente botón para crear una nueva contraseña:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
        </div>
        <p>Si el botón no funciona, copia y pega la siguiente URL completa en tu navegador:</p>
        <p style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all; color: #0066cc; font-family: monospace;">${resetUrl}</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
        <p>Este enlace expirará en 1 hora.</p>
        <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
          <p>MercadoTiendas &copy; 2025</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Error al enviar el email de recuperación');
  }
};

const sendActivationCodeEmail = async (email, activationCode) => {
  const mailOptions = {
    from: `"MercadoTiendas" <${config.emailService.user}>`,
    to: email,
    subject: 'Activación de Cuenta',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h1 style="color: #333; text-align: center;">Activación de Cuenta</h1>
        <p>Gracias por registrarte en MercadoTiendas.</p>
        <p>Para activar tu cuenta, utiliza el siguiente código de activación:</p>
        <div style="text-align: center; margin: 20px 0;">
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${activationCode}</div>
        </div>
        <p>Este código expirará en 1 hora.</p>
        <p>Si no has creado una cuenta en MercadoTiendas, puedes ignorar este correo.</p>
        <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
          <p>MercadoTiendas &copy; 2025</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending activation email:', error);
    throw new Error('Error al enviar el email de activación');
  }
};

const sendSupportTicketEmail = async ({ to, subject, html, text, attachments = [] }) => {
  const mailOptions = {
    from: `"MercadoTiendas" <${config.emailService.user}>`,
    to: to || process.env.SUPPORT_MAIL || config.emailService.user,
    subject,
    html,
    text,
    attachments
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending support ticket email:', error);
    throw new Error('Error al enviar el ticket de soporte');
  }
};

// Envía un correo de acuse de recibo al usuario cuando se crea un ticket de soporte
const sendSupportAckEmail = async ({ to, ticketId }) => {
  if (!to) return; // si no hay correo de destino se omite el envío

  const subject = `[SUPPORT][RECIBIDO] ${ticketId}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <h2 style="color:#1c1c1e">¡Hemos recibido tu solicitud!</h2>
      <p>Gracias por contactarnos. Tu ID de referencia es <strong>${ticketId}</strong>.</p>
      <p>Nuestro equipo la revisará y te responderá a la brevedad.</p>
      <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
        <p>MercadoTiendas &copy; 2025</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"MercadoTiendas" <${config.emailService.user}>`,
      to,
      subject,
      html
    });
  } catch (error) {
    console.error('Error sending support ack email:', error);
  }
};

module.exports = {
  sendResetPasswordEmail,
  sendActivationCodeEmail,
  sendSupportTicketEmail,
  sendSupportAckEmail,

  sendResetPasswordEmail,
  sendActivationCodeEmail,
  sendSupportTicketEmail
};
