const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId && !this.firebaseUid;
    },
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  firebaseUid: {
    type: String,
    sparse: true,
    unique: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Método para encriptar contraseña
userSchema.methods.encryptPassword = async function(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Método para validar contraseña
userSchema.methods.matchPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
