const ShopVisit = require('../models/ShopVisit');
const { successResponse, errorResponse } = require('../utils/response');
const mongoose = require('mongoose');

/**
 * Registra una nueva visita a una tienda
 * @param {Object} req - Request object con shopId en params
 * @param {Object} res - Response object
 */
exports.createVisit = async (req, res) => {
  try {
    const { shopId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shopId)) {
      return errorResponse(res, 'ID de tienda inválido', 400);
    }
    
    // Datos de la visita
    const visitData = {
      shop: shopId,
      visitedAt: new Date()
    };

    // Si hay usuario autenticado, guardar su id
    if (req.user && req.user.id) {
      visitData.user = req.user.id;
    }

    // Guardar IP y User-Agent si están disponibles
    if (req.headers['x-forwarded-for'] || req.ip) {
      visitData.ip = req.headers['x-forwarded-for'] || req.ip;
    }
    
    if (req.headers['user-agent']) {
      visitData.userAgent = req.headers['user-agent'];
    }

    // Crear registro de visita
    const visit = new ShopVisit(visitData);
    await visit.save();

    return successResponse(res, { visit }, 'Visita registrada exitosamente');
  } catch (error) {
    console.error('Error al registrar visita:', error);
    return errorResponse(res, 'Error al registrar visita', 500, error.message);
  }
};

/**
 * Obtiene el total de visitas en las últimas 24 horas para la tienda del usuario autenticado
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getVisitsLast24h = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }

    // Calcular inicio y fin de las últimas 24 horas
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const resultado = await ShopVisit.aggregate([
      {
        $match: {
          shop: user.shop,
          visitedAt: {
            $gte: last24h,
            $lte: now
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const totalVisitas24h = resultado.length > 0 ? resultado[0].total : 0;

    return successResponse(res, { totalVisitas24h }, 'Visitas de las últimas 24 horas obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener las visitas de las últimas 24 horas:', error);
    return errorResponse(res, 'Error al obtener las visitas de las últimas 24 horas', 500, error.message);
  }
};

/**
 * Obtiene el total de visitas de "hoy" y "ayer" para la tienda del usuario autenticado
 * Hoy: desde 00:00:00 hasta ahora
 * Ayer: día calendario anterior completo
 */
exports.getVisitsDayStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(startOfToday.getTime() - 1);

    const [todayAgg, yesterdayAgg] = await Promise.all([
      ShopVisit.aggregate([
        { $match: { shop: user.shop, visitedAt: { $gte: startOfToday, $lte: now } } },
        { $count: 'total' }
      ]),
      ShopVisit.aggregate([
        { $match: { shop: user.shop, visitedAt: { $gte: startOfYesterday, $lte: endOfYesterday } } },
        { $count: 'total' }
      ])
    ]);

    const today = todayAgg.length > 0 ? todayAgg[0].total : 0;
    const yesterday = yesterdayAgg.length > 0 ? yesterdayAgg[0].total : 0;

    return successResponse(res, { today, yesterday }, 'Visitas de hoy y ayer obtenidas exitosamente');
  } catch (error) {
    console.error('Error al obtener visitas de hoy/ayer:', error);
    return errorResponse(res, 'Error al obtener visitas de hoy/ayer', 500, error.message);
  }
};
