// Actualizar una categoría
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image, status, parent } = req.body;
    const user = req.user;
    if (!user || !user.shop) {
      return errorResponse(res, 'El usuario no tiene una tienda asociada', 400);
    }
    const category = await Category.findOne({ _id: id, shop: user.shop });
    if (!category) {
      return errorResponse(res, 'Categoría no encontrada', 404);
    }
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (image !== undefined) category.image = image;
    if (status !== undefined) category.status = status;
    if (parent !== undefined) category.parent = parent;
    await category.save();
    return successResponse(res, category, 'Categoría actualizada exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar la categoría', 500, error.message);
  }
};
