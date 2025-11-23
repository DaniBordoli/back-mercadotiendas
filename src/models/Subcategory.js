const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre de la subcategoría es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'La categoría padre es requerida']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Índice compuesto para optimizar búsquedas por categoría
subcategorySchema.index({ category: 1, isActive: 1 });

// Índice para búsquedas por nombre
subcategorySchema.index({ name: 1 });

// Método para obtener subcategorías activas de una categoría
subcategorySchema.statics.findByCategory = function(categoryId) {
  return this.find({ 
    category: categoryId, 
    isActive: true 
  }).sort({ order: 1, name: 1 });
};

// Middleware para popular la categoría automáticamente
subcategorySchema.pre(/^find/, function(next) {
  this.populate({
    path: 'category',
    select: 'name description'
  });
  next();
});

module.exports = mongoose.model('Subcategory', subcategorySchema);