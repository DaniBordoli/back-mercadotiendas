const { successResponse, errorResponse } = require('../utils/response');
const Product = require('../models/Products');
const { quoteShipment, getBranches, buildPackageDimensions } = require('../services/andreani.service');

const quoteAndreani = async (req, res) => {
  try {
    const { postalCode, province, locality, items } = req.body || {};

    if (!postalCode) {
      return errorResponse(res, 'El código postal de destino es obligatorio', 400);
    }

    let products = [];

    if (Array.isArray(items) && items.length > 0) {
      const productIds = items.map((i) => i.productId).filter(Boolean);

      if (productIds.length > 0) {
        const dbProducts = await Product.find({ _id: { $in: productIds } });
        const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

        products = items.map((i) => {
          const prod = productMap.get(String(i.productId));
          return prod || {};
        });
      }
    }

    const data = await quoteShipment({
      postalCode,
      province,
      locality,
      products,
    });

    return successResponse(res, data, 'Cotización Andreani obtenida correctamente');
  } catch (err) {
    console.error('Error en quoteAndreani:', err.message);
    return errorResponse(res, 'No se pudo obtener la cotización de Andreani', 500);
  }
};

const listAndreaniBranches = async (req, res) => {
  try {
    const { postalCode } = req.query;

    if (!postalCode) {
      return errorResponse(res, 'El código postal es obligatorio', 400);
    }

    const data = await getBranches({ postalCode });

    return successResponse(res, data, 'Sucursales Andreani obtenidas correctamente');
  } catch (err) {
    console.error('Error en listAndreaniBranches:', err.message);
    return errorResponse(res, 'No se pudieron obtener las sucursales de Andreani', 500);
  }
};

module.exports = {
  quoteAndreani,
  listAndreaniBranches,
  buildPackageDimensions,
};

