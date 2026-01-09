const mongoose = require('mongoose');
const slugify = require('slugify');

const liveEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    startDateTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'live', 'finished'],
      default: 'draft',
    },
    endedAt: {
      type: Date,
      default: null,
    },
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    socialAccounts: [
      {
        platform: String,
        username: String,
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Vinculación opcional a una campaña activa
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },
    highlightedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    // Nuevo: producto actualmente destacado y marca de tiempo de inicio
    currentHighlightedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    highlightStartedAt: {
      type: Date,
      default: null,
    },
    socialAccounts: [{
      platform: { type: String },
      username: { type: String },
    }],
    youtubeVideoId: {
      type: String,
      trim: true,
    },
    platform: {
      type: String,
      trim: true,
      lowercase: true,
    },
    muxLiveStreamId: {
      type: String,
      trim: true,
      default: null,
    },
    muxPlaybackId: {
      type: String,
      trim: true,
      default: null,
    },
    muxReplayPlaybackId: {
      type: String,
      trim: true,
      default: null,
    },
    muxStreamKey: {
      type: String,
      trim: true,
      default: null,
    },
    muxAssetId: {
      type: String,
      trim: true,
      default: null,
    },
    muxStatus: {
      type: String,
      trim: true,
      default: null,
    },
    previewImageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    remindersCount: {
      type: Number,
      default: 0,
    },
    slug: {
      type: String,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware for slug generation and updatedAt
liveEventSchema.pre('save', function (next) {
  // Generate slug only if not present or title changed
  const hasTitle = typeof this.title === 'string' && this.title.trim() !== '';
  const shouldGenerateSlug = hasTitle && (!this.slug || this.isModified('title'));
  if (shouldGenerateSlug) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    const uniqueSuffix = Date.now().toString(36);
    this.slug = `${baseSlug}-${uniqueSuffix}`;
  }

  next();
});

module.exports = mongoose.model('LiveEvent', liveEventSchema);
