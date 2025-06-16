/**
 * Script para simular un webhook de Mobbex
 * Útil para pruebas locales de la integración
 * 
 * Uso: node src/scripts/test-mobbex-webhook.js
 */

const axios = require('axios');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

const WEBHOOK_URL = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/webhook`;

// Datos de ejemplo para simular un webhook de pago aprobado
const mockWebhookData = {
  type: 'payment.approved',
  data: {
    id: `test_payment_${Date.now()}`,
    reference: `user_123_${Date.now()}`,
    status: {
      code: '200',
      text: 'Pago aprobado'
    },
    payment_method: {
      name: 'Tarjeta de prueba',
      type: 'credit_card'
    },
    total: 1500,
    currency: 'ARS',
    created: new Date().toISOString(),
    customer: {
      email: 'test@example.com',
      name: 'Usuario de Prueba'
    }
  }
};

async function sendMockWebhook() {
  console.log('Enviando webhook de prueba a:', WEBHOOK_URL);
  console.log('Datos:', JSON.stringify(mockWebhookData, null, 2));
  
  try {
    const response = await axios.post(WEBHOOK_URL, mockWebhookData);
    console.log('Respuesta del servidor:', response.status);
    console.log('Datos de respuesta:', response.data);
  } catch (error) {
    console.error('Error al enviar webhook:', error.message);
    if (error.response) {
      console.error('Respuesta de error:', error.response.data);
    }
  }
}

// Ejecutar la función
sendMockWebhook();
