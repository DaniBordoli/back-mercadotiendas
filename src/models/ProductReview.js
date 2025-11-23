const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  comment: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  // Array de votos útiles: cada elemento indica qué usuario votó y si fue "yes" o "no"
  helpfulVotes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    vote: {
      type: String,
      enum: ['yes', 'no'],
      required: true,
    },
  }],
  // Respuesta del vendedor a la reseña
  reply: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now,
    }
  }
}, {
  timestamps: true
});

const ProductReview = mongoose.model('ProductReview', productReviewSchema);


module.exports = ProductReview;
