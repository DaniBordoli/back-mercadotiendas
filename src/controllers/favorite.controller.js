const UserFavorite = require('../models/UserFavorite');
const Product = require('../models/Products');
const { successResponse, errorResponse } = require('../utils/response');

exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { shopId } = req.query;

    const query = { user: userId };
    if (shopId) query.shop = shopId;

    const favorites = await UserFavorite.find(query)
      .populate({ path: 'product', select: 'nombre precio productImages shop' })
      .populate({ path: 'shop', select: 'name imageUrl' });

    return successResponse(res, favorites, 'Favoritos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener favoritos', 500, error.message);
  }
};

exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.body;

    if (!productId) {
      return errorResponse(res, 'productId requerido', 400);
    }

    const product = await Product.findById(productId).populate('shop');
    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }

    const shopId = product.shop?._id || product.shop;

    const existing = await UserFavorite.findOne({ user: userId, product: productId });
    if (existing) {
      return successResponse(res, existing, 'Ya estaba en favoritos');
    }

    const fav = await UserFavorite.create({ user: userId, product: productId, shop: shopId });
    const populated = await fav.populate({ path: 'product', select: 'nombre precio productImages shop' });
    return successResponse(res, populated, 'Agregado a favoritos', 201);
  } catch (error) {
    if (error.code === 11000) {
      return successResponse(res, null, 'Ya estaba en favoritos');
    }
    return errorResponse(res, 'Error al agregar a favoritos', 500, error.message);
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { productId } = req.params;

    if (!productId) {
      return errorResponse(res, 'productId requerido', 400);
    }

    await UserFavorite.deleteOne({ user: userId, product: productId });
    return successResponse(res, null, 'Eliminado de favoritos');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar de favoritos', 500, error.message);
  }
};
