const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: false, // Hacemos esto opcional ya que con Google/Firebase podemos recibir solo el nombre
  },
  name: {
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
      return !this.googleId && !this.firebaseId; // Password solo requerido para login normal
    },
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  firebaseId: {
    type: String,
    sparse: true,
    unique: true
  },
  isActivated: {
    type: Boolean,
    default: false
  },
  activationCode: {
    type: String
  },
  activationCodeExpires: {
    type: Date
  },
  birthDate: {
    type: Date,
    required: false
  },
  userPhone: {
    type: String,
    Optional: true

  },
  city: {
    type: String,
    required: false
  },
  province: {
    type: String,
    required: false
  },
  country: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop'
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  avatar: {
    type: String,
    default: null
  },
  refreshToken: {
    type: String,
    default: null
  }
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
