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

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@mercadotiendas.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';

    const existingByEmail = await User.findOne({ email: adminEmail });
    if (existingByEmail) {
      const nextRoles = Array.from(new Set([...(existingByEmail.userType || []), 'admin']));
      existingByEmail.userType = nextRoles;
      existingByEmail.isActivated = true;
      existingByEmail.name = existingByEmail.name || existingByEmail.fullName || 'Admin';
      if (!existingByEmail.password) {
        existingByEmail.password = await existingByEmail.encryptPassword(adminPassword);
      }
      await existingByEmail.save();
      console.log('Existing user promoted to admin');
    } else {
      const adminUser = new User({
        name: 'Admin',
        fullName: 'Admin',
        email: adminEmail,
        password: adminPassword,
        userType: ['admin'],
        isActivated: true
      });
      adminUser.password = await adminUser.encryptPassword(adminUser.password);
      await adminUser.save();
      console.log('Admin user created successfully');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
};

initDB();
