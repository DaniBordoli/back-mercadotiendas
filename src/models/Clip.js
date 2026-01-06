const mongoose = require('mongoose');

const clipSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'processing', 'published', 'error'],
      default: 'pending',
    },
    muxUploadId: {
      type: String,
      trim: true,
      default: null,
    },
    muxAssetId: {
      type: String,
      trim: true,
      default: null,
    },
    muxPlaybackId: {
      type: String,
      trim: true,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: null,
    },
    visibility: {
      type: String,
      enum: ['public', 'hidden', 'deleted'],
      default: 'public',
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    liveEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LiveEvent',
      default: null,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
    comments: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Clip', clipSchema);
