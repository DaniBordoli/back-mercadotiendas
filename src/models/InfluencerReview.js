const mongoose = require('mongoose');

/**
 * InfluencerReview
 * Almacena reseñas realizadas por empresas a influencers tras una campaña.
 *  - campaignId: referencia a la campaña donde colaboraron
 *  - influencerId: perfil del influencer reseñado
 *  - companyId: empresa que califica (owner de la tienda)
 *  - rating: puntaje 1–5 (obligatorio)
 *  - comment: texto opcional (20–1000 caracteres)
 *  - tags: array de etiquetas de feedback
 *  - status: flujo de moderación (published, edited, reported, hidden)
 *  - reply: respuesta del influencer (opcional)
 *  - editableUntil: fecha límite para que la empresa edite (48 h posteriores a creación)
 */
const influencerReviewSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    influencerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InfluencerProfile',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // usuario dueño de la empresa/tienda
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    tags: [{
      type: String,
      enum: ['content_quality', 'milestone_compliance', 'punctuality', 'communication', 'impact_sales'],
    }],
    status: {
      type: String,
      enum: ['published', 'edited', 'reported', 'hidden'],
      default: 'published',
      index: true,
    },
    reply: {
      text: { type: String, trim: true },
      createdAt: { type: Date },
    },
    editableUntil: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices compuestos para consultas frecuentes
influencerReviewSchema.index({ influencerId: 1, createdAt: -1 });

module.exports = mongoose.model('InfluencerReview', influencerReviewSchema);