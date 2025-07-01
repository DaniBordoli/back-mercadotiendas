const Currency = require('../models/Currency');
const { successResponse, errorResponse } = require('../utils/response');

// Obtener todas las monedas
const getCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ isActive: true })
      .sort({ createdAt: -1 });
    
    return successResponse(res, currencies, 'Monedas obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener monedas:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

// Crear nueva moneda
const createCurrency = async (req, res) => {
  try {
    const { name, symbol, code } = req.body;
    const userId = req.user.id;
    
    // Validaciones
    if (!name || !symbol || !code) {
      return errorResponse(res, 'Nombre, símbolo y código son requeridos', 400);
    }
    
    if (code.length !== 3) {
      return errorResponse(res, 'El código debe tener exactamente 3 caracteres', 400);
    }
    
    // Verificar si ya existe una moneda con el mismo código
    const existingCurrency = await Currency.findOne({ 
      code: code.toUpperCase() 
    });
    
    if (existingCurrency) {
      return errorResponse(res, 'Ya existe una moneda con ese código', 400);
    }
    
    // Crear nueva moneda
    const currency = new Currency({
      name: name.trim(),
      symbol: symbol.trim(),
      code: code.toUpperCase().trim(),
      createdBy: userId
    });
    
    await currency.save();
    
    return successResponse(res, currency, 'Moneda creada exitosamente', 201);
  } catch (error) {
    console.error('Error al crear moneda:', error);
    
    if (error.code === 11000) {
      return errorResponse(res, 'Ya existe una moneda con ese código', 400);
    }
    
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

// Actualizar moneda
const updateCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, symbol, code } = req.body;
    
    const currency = await Currency.findById(id);
    
    if (!currency || !currency.isActive) {
      return errorResponse(res, 'Moneda no encontrada', 404);
    }
    
    // Si se está actualizando el código, verificar que no exista
    if (code && code.toUpperCase() !== currency.code) {
      const existingCurrency = await Currency.findOne({ 
        code: code.toUpperCase(),
        _id: { $ne: id }
      });
      
      if (existingCurrency) {
        return errorResponse(res, 'Ya existe una moneda con ese código', 400);
      }
    }
    
    // Actualizar campos
    if (name !== undefined) currency.name = name.trim();
    if (symbol !== undefined) currency.symbol = symbol.trim();
    if (code !== undefined) currency.code = code.toUpperCase().trim();
    
    await currency.save();
    
    return successResponse(res, currency, 'Moneda actualizada exitosamente');
  } catch (error) {
    console.error('Error al actualizar moneda:', error);
    
    if (error.code === 11000) {
      return errorResponse(res, 'Ya existe una moneda con ese código', 400);
    }
    
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

// Eliminar moneda (soft delete)
const deleteCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    
    const currency = await Currency.findById(id);
    
    if (!currency || !currency.isActive) {
      return errorResponse(res, 'Moneda no encontrada', 404);
    }
    
    // Soft delete - marcar como inactiva
    currency.isActive = false;
    await currency.save();
    
    return successResponse(res, null, 'Moneda eliminada exitosamente');
  } catch (error) {
    console.error('Error al eliminar moneda:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

module.exports = {
  getCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency
};
