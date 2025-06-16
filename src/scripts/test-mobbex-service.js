/**
 * Script para probar directamente el servicio de Mobbex
 * Útil para pruebas locales de la integración sin pasar por los controladores
 * 
 * Uso: node src/scripts/test-mobbex-service.js
 */

require('dotenv').config();
const mobbexService = require('../services/mobbex.service');

// Datos de ejemplo para un checkout
const orderData = {
  total: 1500.50,
  description: 'Compra de prueba en MercadoTiendas',
  reference: `test_order_${Date.now()}`
};

const customerData = {
  email: 'test@example.com',
  name: 'Usuario de Prueba',
  identification: '12345678'
};

const items = [
  {
    name: 'Producto de prueba',
    description: 'Descripción del producto de prueba',
    quantity: 1,
    price: 1500.50,
    image: 'https://www.mobbex.com/wp-content/uploads/2019/03/web_logo.png'
  }
];

async function testMobbexService() {
  console.log('Probando servicio de Mobbex...');
  console.log('Datos del pedido:', JSON.stringify(orderData, null, 2));
  console.log('Datos del cliente:', JSON.stringify(customerData, null, 2));
  console.log('Items:', JSON.stringify(items, null, 2));
  
  try {
    // Probar creación de checkout
    console.log('\n1. Probando creación de checkout:');
    const checkout = await mobbexService.createCheckout(orderData, customerData, items);
    console.log('Checkout creado exitosamente:');
    console.log('ID:', checkout.id);
    console.log('URL:', checkout.url);
    console.log('Estado:', checkout.status);
    
    if (checkout && checkout.id) {
      // Probar verificación de estado de pago
      console.log('\n2. Probando verificación de estado de pago:');
      const paymentStatus = await mobbexService.checkPaymentStatus(checkout.id);
      console.log('Estado del pago:');
      console.log(JSON.stringify(paymentStatus, null, 2));
      
      // Probar procesamiento de webhook
      console.log('\n3. Probando procesamiento de webhook:');
      const webhookData = {
        type: 'payment.approved',
        data: {
          id: checkout.id,
          reference: orderData.reference,
          status: {
            code: '200',
            text: 'Pago aprobado'
          },
          payment_method: {
            name: 'Tarjeta de prueba',
            type: 'credit_card'
          },
          total: orderData.total,
          currency: 'ARS',
          created: new Date().toISOString(),
          customer: {
            email: customerData.email,
            name: customerData.name
          }
        }
      };
      
      const webhookResult = await mobbexService.processWebhook(webhookData);
      console.log('Resultado del procesamiento de webhook:');
      console.log(JSON.stringify(webhookResult, null, 2));
    }
  } catch (error) {
    console.error('Error al probar el servicio de Mobbex:', error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
  }
}

// Ejecutar la función
testMobbexService();
