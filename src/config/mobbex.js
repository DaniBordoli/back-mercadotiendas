/**
 * Configuración de Mobbex
 * Centraliza las credenciales y configuración para la integración con Mobbex
 */

const config = {
  apiKey: process.env.MOBBEX_API_KEY,
  accessToken: process.env.MOBBEX_ACCESS_TOKEN,
  auditKey: process.env.MOBBEX_AUDIT_KEY || null,
  returnUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  webhookUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/webhook`
};

module.exports = config;
