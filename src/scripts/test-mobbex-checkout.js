/**
 * Script para probar la creación de un checkout de Mobbex
 * Útil para pruebas locales de la integración
 * 
 * Uso: node src/scripts/test-mobbex-checkout.js
 */

const axios = require('axios');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

// Cargar variables de entorno
dotenv.config();

const API_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET_DEV || 'test-secret';

// Crear un token JWT de prueba para un usuario ficticio
function createTestToken() {
  const payload = {
    id: '60d21b4667d0d8992e610c85', // ID ficticio de usuario
    email: 'test@example.com',
    role: 'user'
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

// Datos de ejemplo para un checkout
const checkoutData = {
  orderData: {
    total: 1500.50,
    description: 'Compra de prueba en MercadoTiendas',
    reference: `test_order_${Date.now()}`
  },
  customerData: {
    email: 'test@example.com',
    name: 'Usuario de Prueba',
    identification: '12345678'
  },
  items: [
    {
      name: 'Producto de prueba',
      description: 'Descripción del producto de prueba',
      quantity: 1,
      price: 1500.50
    }
  ]
};

async function testCheckoutCreation() {
  const token = createTestToken();
  console.log('Token JWT generado para pruebas');
  
  console.log('Enviando solicitud de checkout a:', `${API_URL}/api/payments/checkout`);
  console.log('Datos:', JSON.stringify(checkoutData, null, 2));
  
  try {
    const response = await axios.post(`${API_URL}/api/payments/checkout`, checkoutData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Respuesta del servidor:', response.status);
    console.log('Datos de respuesta:', response.data);
    
    if (response.data.success && response.data.data.url) {
      console.log('URL de checkout generada:', response.data.data.url);
      console.log('Para probar el checkout, abre esta URL en tu navegador.');
    }
  } catch (error) {
    console.error('Error al crear checkout:', error.message);
    if (error.response) {
      console.error('Respuesta de error:', error.response.data);
    }
  }
}

// Ejecutar la función
testCheckoutCreation();
