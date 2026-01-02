const mongoose = require('mongoose');

/**
 * Esquema para el perfil de influencer
 * Almacena información específica de los usuarios que son influencers
 */
const influencerProfileSchema = new mongoose.Schema({
  // Referencia al usuario asociado con este perfil
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Nicho o categoría principal del influencer
  niche: {
    type: String,
    required: true,
    trim: true
  },
  
  // Biografía o descripción del influencer
  bio: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  
  socialMedia: [{
    platform: {
      type: String,
      required: true,
      enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'linkedin', 'other']
    },
    username: {
      type: String,
      required: true,
      trim: true
    },
    followers: {
      type: Number,
      default: 0
    },
    url: {
      type: String,
      trim: true
    }
  }],
  payoutMethods: [{
    methodType: {
      type: String,
      required: true,
      enum: ['tuki_wallet', 'bank_transfer', 'other']
    },
    alias: {
      type: String,
      trim: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    active: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Estadísticas del influencer
  stats: {
    totalApplications: {
      type: Number,
      default: 0
    },
    acceptedApplications: {
      type: Number,
      default: 0
    },
    completedCampaigns: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalFollowers: {
      type: Number,
      default: 0
    }
  },
  
  // Estado de la solicitud de influencer
  applicationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Comentarios administrativos sobre la solicitud
  adminComments: {
    type: String,
    trim: true
  },
  
  // Fechas de creación y actualización
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware pre-save para actualizar la fecha de modificación
influencerProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Método para actualizar estadísticas cuando se aplica a una campaña
influencerProfileSchema.methods.applyToCampaign = async function() {
  this.stats.totalApplications += 1;
  await this.save();
};

// Método para actualizar estadísticas cuando se acepta una aplicación
influencerProfileSchema.methods.applicationAccepted = async function() {
  this.stats.acceptedApplications += 1;
  await this.save();
};

// Método para actualizar estadísticas cuando se completa una campaña
influencerProfileSchema.methods.campaignCompleted = async function(rating) {
  this.stats.completedCampaigns += 1;
  
  // Actualizar rating promedio
  if (rating) {
    const currentTotal = this.stats.rating * (this.stats.completedCampaigns - 1);
    const newTotal = currentTotal + rating;
    this.stats.rating = newTotal / this.stats.completedCampaigns;
  }
  
  await this.save();
};

module.exports = mongoose.model('InfluencerProfile', influencerProfileSchema);
