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
  const resetUrl = `${process.env.FRONTEND_URL}/password-restore?token=${token}`;

  const mailOptions = {
    from: `"MercadoTiendas" <${config.emailService.user}>`,
    to: email,
    subject: 'Recuperación de Contraseña',
    html: `
      <h1>Recuperación de Contraseña</h1>
      <p>Has solicitado restablecer tu contraseña.</p>
      <p>Haz click en el siguiente enlace para crear una nueva contraseña:</p>
      <a href="${resetUrl}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0;">Restablecer Contraseña</a>
      <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      <p>Este enlace expirará en 1 hora.</p>
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
