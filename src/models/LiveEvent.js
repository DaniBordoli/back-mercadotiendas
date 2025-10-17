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
    products: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    highlightedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
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
  if (!this.slug || this.isModified('title')) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    const uniqueSuffix = Date.now().toString(36);
    this.slug = `${baseSlug}-${uniqueSuffix}`;
  }

  next();
});

module.exports = mongoose.model('LiveEvent', liveEventSchema);