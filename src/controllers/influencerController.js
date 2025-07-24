const User = require('../models/User');
const InfluencerProfile = require('../models/InfluencerProfile');
const { validationResult } = require('express-validator');

/**
 * @desc    Procesar solicitud para convertirse en influencer
 * @route   POST /api/users/become-influencer
 * @access  Private
 */
exports.applyToBecomeInfluencer = async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user._id;
    const { niche, bio, socialMedia } = req.body;

    // Verificar si el usuario ya es influencer
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    // Verificar si ya existe un perfil de influencer para este usuario
    let influencerProfile = await InfluencerProfile.findOne({ user: userId });
    if (influencerProfile) {
      return res.status(400).json({ msg: 'Ya existe un perfil de influencer para este usuario' });
    }

    // Crear nuevo perfil de influencer
    influencerProfile = new InfluencerProfile({
      user: userId,
      niche,
      bio,
      socialMedia,
      applicationStatus: 'pending'
    });

    await influencerProfile.save();

    // Actualizar el usuario (no cambiamos isInfluencer hasta que sea aprobado)
    // Si se quiere aprobar automáticamente, descomentar la siguiente línea
    // user.isInfluencer = true;
    // await user.save();

    res.status(201).json({
      msg: 'Solicitud para convertirse en influencer enviada correctamente',
      profile: influencerProfile
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};

/**
 * @desc    Obtener perfil de influencer
 * @route   GET /api/users/influencer-profile
 * @access  Private
 */
exports.getInfluencerProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    // Buscar perfil de influencer con datos de usuario
    const influencerProfile = await InfluencerProfile.findOne({ user: userId }).populate('user', 'name email');

    if (!influencerProfile) {
      return res.status(404).json({ msg: 'Perfil de influencer no encontrado' });
    }

    res.json(influencerProfile);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};

/**
 * @desc    Actualizar perfil de influencer
 * @route   PUT /api/users/influencer-profile
 * @access  Private
 */
exports.updateInfluencerProfile = async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user._id;
    const { niche, bio, socialMedia } = req.body;

    // Verificar si existe el perfil
    let influencerProfile = await InfluencerProfile.findOne({ user: userId });
    if (!influencerProfile) {
      return res.status(404).json({ msg: 'Perfil de influencer no encontrado' });
    }

    // Actualizar campos
    if (niche) influencerProfile.niche = niche;
    if (bio) influencerProfile.bio = bio;
    if (socialMedia) influencerProfile.socialMedia = socialMedia;

    await influencerProfile.save();

    res.json({
      msg: 'Perfil de influencer actualizado correctamente',
      profile: influencerProfile
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};

/**
 * @desc    Aprobar solicitud de influencer (solo admin)
 * @route   PUT /api/admin/influencer/:id/approve
 * @access  Private/Admin
 */
exports.approveInfluencerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminComments } = req.body;

    // Buscar perfil de influencer
    const influencerProfile = await InfluencerProfile.findById(id);
    if (!influencerProfile) {
      return res.status(404).json({ msg: 'Perfil de influencer no encontrado' });
    }

    // Actualizar estado
    influencerProfile.applicationStatus = 'approved';
    if (adminComments) {
      influencerProfile.adminComments = adminComments;
    }
    await influencerProfile.save();

    // Actualizar usuario
    const user = await User.findById(influencerProfile.user);
    if (user) {
      user.isInfluencer = true;
      await user.save();
    }

    res.json({
      msg: 'Solicitud de influencer aprobada correctamente',
      profile: influencerProfile
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};

/**
 * @desc    Rechazar solicitud de influencer (solo admin)
 * @route   PUT /api/admin/influencer/:id/reject
 * @access  Private/Admin
 */
exports.rejectInfluencerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminComments } = req.body;

    // Buscar perfil de influencer
    const influencerProfile = await InfluencerProfile.findById(id);
    if (!influencerProfile) {
      return res.status(404).json({ msg: 'Perfil de influencer no encontrado' });
    }

    // Actualizar estado
    influencerProfile.applicationStatus = 'rejected';
    if (adminComments) {
      influencerProfile.adminComments = adminComments;
    }
    await influencerProfile.save();

    res.json({
      msg: 'Solicitud de influencer rechazada',
      profile: influencerProfile
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};

/**
 * @desc    Listar todas las solicitudes de influencer (solo admin)
 * @route   GET /api/admin/influencer/applications
 * @access  Private/Admin
 */
exports.listInfluencerApplications = async (req, res) => {
  try {
    const { status } = req.query;
    
    // Filtrar por estado si se proporciona
    const filter = status ? { applicationStatus: status } : {};
    
    const applications = await InfluencerProfile.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(applications);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error en el servidor');
  }
};
