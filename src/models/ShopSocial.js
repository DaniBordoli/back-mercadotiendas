const mongoose = require('mongoose');

const ShopSocialSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    unique: true
  },
  instagram: { type: String, default: '' },
  facebook: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  tiktok: { type: String, default: '' },
  youtube: { type: String, default: '' },
  horarios: { type: String, default: '' },
  emailAlternativo: { type: String, default: '' },
  telefonoAdicional: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('shopnetwork', ShopSocialSchema);
