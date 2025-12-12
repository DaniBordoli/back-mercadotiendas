const mongoose = require('mongoose');

const userFavoriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  createdAt: { type: Date, default: Date.now }
});

userFavoriteSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('UserFavorite', userFavoriteSchema);
