const mongoose = require('mongoose');
const { Clip } = require('../models');
const { successResponse, errorResponse } = require('../utils/response');

exports.createUploadUrl = async (req, res) => {
  try {
    const { productId, title, description, category } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return errorResponse(res, 'El título es obligatorio', 400);
    }

    let product = null;
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return errorResponse(res, 'productId inválido', 400);
      }
      product = productId;
    }

    const clip = new Clip({
      owner: req.user._id,
      product,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      category: typeof category === 'string' ? category.trim() : undefined,
      status: 'uploading',
    });

    await clip.save();

    const originHeader = req.headers.origin;
    const corsOrigin = originHeader && typeof originHeader === 'string' ? originHeader : '*';
    const { createDirectUpload } = require('../services/mux.service');
    const created = await createDirectUpload({
      corsOrigin,
      test: String(process.env.MUX_TEST_MODE || '').toLowerCase() === 'true',
      passthrough: String(clip._id),
    });

    clip.muxUploadId = created.id || null;
    if (created.assetId) {
      clip.muxAssetId = created.assetId;
      if (!clip.status || clip.status === 'uploading') {
        clip.status = 'processing';
      }
    }
    await clip.save();

    return successResponse(
      res,
      {
        uploadUrl: created.url,
        clipId: clip._id,
      },
      'URL de subida creada exitosamente',
      201
    );
  } catch (error) {
    return errorResponse(res, 'Error al crear URL de subida', 500, error.message);
  }
};

exports.getMyClips = async (req, res) => {
  try {
    const { status, productId } = req.query || {};
    const query = {
      owner: req.user._id,
      visibility: { $ne: 'deleted' },
    };

    if (status && typeof status === 'string') {
      query.status = status;
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.product = productId;
    }

    const clips = await Clip.find(query)
      .sort({ createdAt: -1 })
      .populate('product', 'nombre precio productImages');

    return successResponse(res, clips, 'Clips obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener los clips', 500, error.message);
  }
};

exports.updateClip = async (req, res) => {
  try {
    const { clipId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clipId)) {
      return errorResponse(res, 'clipId inválido', 400);
    }

    const clip = await Clip.findOne({ _id: clipId, owner: req.user._id, visibility: { $ne: 'deleted' } });
    if (!clip) {
      return errorResponse(res, 'Clip no encontrado', 404);
    }

    const { title, description, category, productId } = req.body || {};

    if (typeof title === 'string') {
      clip.title = title.trim();
    }
    if (typeof description === 'string') {
      clip.description = description.trim();
    }
    if (typeof category === 'string') {
      clip.category = category.trim();
    }
    if (typeof productId !== 'undefined') {
      if (productId === null || productId === '') {
        clip.product = null;
      } else if (!mongoose.Types.ObjectId.isValid(productId)) {
        return errorResponse(res, 'productId inválido', 400);
      } else {
        clip.product = productId;
      }
    }

    await clip.save();
    return successResponse(res, clip, 'Clip actualizado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar el clip', 500, error.message);
  }
};

exports.deleteClip = async (req, res) => {
  try {
    const { clipId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clipId)) {
      return errorResponse(res, 'clipId inválido', 400);
    }

    const clip = await Clip.findOne({ _id: clipId, owner: req.user._id, visibility: { $ne: 'deleted' } });
    if (!clip) {
      return errorResponse(res, 'Clip no encontrado', 404);
    }

    clip.visibility = 'deleted';
    await clip.save();

    return successResponse(res, null, 'Clip eliminado exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar el clip', 500, error.message);
  }
};

exports.discoverClips = async (req, res) => {
  try {
    const { category, limit } = req.query || {};
    const query = {
      status: 'published',
      visibility: 'public',
      isApproved: true,
    };

    if (category && typeof category === 'string' && category.trim()) {
      query.category = category.trim();
    }

    const lim = Number(limit) > 0 && Number(limit) <= 50 ? Number(limit) : 12;

    const clips = await Clip.find(query)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate('product', 'nombre precio productImages')
      .populate('owner', 'fullName name avatar influencerProfile shop');

    const payload = clips.map((clip) => {
      const owner = clip.owner || {};
      const influencerProfile = owner.influencerProfile || {};
      const shop = owner.shop || {};
      const creatorName = shop.name || owner.fullName || owner.name || '';
      const username =
        influencerProfile.username ||
        (Array.isArray(influencerProfile.socialMedia) && influencerProfile.socialMedia.length
          ? influencerProfile.socialMedia[0].username
          : '');

      return {
        _id: clip._id,
        title: clip.title,
        description: clip.description,
        category: clip.category,
        status: clip.status,
        muxPlaybackId: clip.muxPlaybackId,
        thumbnailUrl: clip.thumbnailUrl,
        duration: clip.duration,
        createdAt: clip.createdAt,
        product: clip.product,
        creator: {
          _id: owner._id,
          name: creatorName,
          username: username || undefined,
          avatar: owner.avatar || undefined,
          shopName: shop.name || undefined,
        },
      };
    });

    return successResponse(res, payload, 'Clips públicos obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener clips públicos', 500, error.message);
  }
};

exports.getClipsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return errorResponse(res, 'productId inválido', 400);
    }

    const clips = await Clip.find({
      product: productId,
      status: 'published',
      visibility: 'public',
      isApproved: true,
    })
      .sort({ createdAt: -1 })
      .populate('product', 'nombre precio productImages')
      .populate('owner', 'fullName name avatar influencerProfile shop');

    return successResponse(res, clips, 'Clips del producto obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, 'Error al obtener clips del producto', 500, error.message);
  }
};
