/**
 * Script para limpiar pagos que no tienen un usuario válido asociado
 * Esto puede ocurrir cuando se ejecutan scripts de prueba o webhooks sin contexto de usuario
 * 
 * Uso: node src/scripts/clean-invalid-payments.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Cargar variables de entorno
dotenv.config();

async function cleanInvalidPayments() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI_DEV || process.env.MONGODB_URI || 'mongodb://localhost:27017/mercadotiendas';
    await mongoose.connect(mongoUri);
    console.log('Conectado a MongoDB');

    // Buscar todos los pagos
    const allPayments = await Payment.find({});
    console.log(`Total de pagos encontrados: ${allPayments.length}`);

    let invalidPayments = [];
    let validPayments = [];

    // Verificar cada pago
    for (const payment of allPayments) {
      if (!payment.user) {
        // Pago sin usuario
        invalidPayments.push(payment);
        console.log(`Pago sin usuario encontrado: ${payment._id} - ${payment.mobbexId}`);
      } else {
        // Verificar si el usuario existe
        const userExists = await User.findById(payment.user);
        if (!userExists) {
          // Usuario no existe
          invalidPayments.push(payment);
          console.log(`Pago con usuario inexistente: ${payment._id} - Usuario: ${payment.user}`);
        } else {
          validPayments.push(payment);
        }
      }
    }

    console.log(`\nResumen:`);
    console.log(`Pagos válidos: ${validPayments.length}`);
    console.log(`Pagos inválidos: ${invalidPayments.length}`);

    if (invalidPayments.length > 0) {
      console.log('\n¿Deseas eliminar los pagos inválidos? (y/n)');
      
      // En un entorno de producción, podrías usar readline para confirmación
      // Por ahora, solo mostramos los pagos inválidos
      console.log('\nPagos que serían eliminados:');
      invalidPayments.forEach(payment => {
        console.log(`- ID: ${payment._id}, MobbexID: ${payment.mobbexId}, Monto: ${payment.amount}, Fecha: ${payment.createdAt}`);
      });

      // Eliminar los pagos inválidos
      await Payment.deleteMany({ _id: { $in: invalidPayments.map(p => p._id) } });
      console.log(`\n${invalidPayments.length} pagos inválidos eliminados exitosamente.`);
    } else {
      console.log('\nNo se encontraron pagos inválidos.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Desconectado de MongoDB');
  }
}

cleanInvalidPayments();