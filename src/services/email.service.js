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
  // Construir la URL completa para el reseteo de contraseña
  const resetUrl = `${process.env.FRONTEND_URL}/password-restore?token=${token}`;

  // Opciones del correo con HTML plano para evitar problemas de formato
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

module.exports = {
  sendResetPasswordEmail
};
