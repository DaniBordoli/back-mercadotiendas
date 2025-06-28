const ShopSocial = require('../models/ShopSocial');

// Crear o actualizar redes sociales de la tienda
exports.upsertShopSocial = async (req, res) => {
  try {
    const { shopId } = req.params;
    const update = req.body;
    const social = await ShopSocial.findOneAndUpdate(
      { shop: shopId },
      { ...update, shop: shopId },
      { new: true, upsert: true }
    );
    res.json(social);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener redes sociales de la tienda
exports.getShopSocial = async (req, res) => {
  try {
    const { shopId } = req.params;
    const social = await ShopSocial.findOne({ shop: shopId });
    if (!social) return res.status(404).json({ message: 'No social data found' });
    res.json(social);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
