const mongoose = require('mongoose');

const clipCommentSchema = new mongoose.Schema(
  {
    clip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clip',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

clipCommentSchema.index({ clip: 1, createdAt: -1 });

module.exports = mongoose.model('ClipComment', clipCommentSchema);

