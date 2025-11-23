require('dotenv').config();
const mongoose = require('mongoose');
const { config } = require('../config');
const User = require('../models/User');

const initDB = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(config.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Verificar si ya existe un admin
    const adminExists = await User.findOne({ userType: 'admin' });
    if (adminExists) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Crear usuario admin
    const adminUser = new User({
      fullName: 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@mercadotiendas.com',
      password: process.env.ADMIN_PASSWORD || 'admin123456',
      userType: ['admin']
    });

    // Encriptar contraseña
    adminUser.password = await adminUser.encryptPassword(adminUser.password);

    // Guardar admin
    await adminUser.save();
    console.log('Admin user created successfully');

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
};

initDB();
