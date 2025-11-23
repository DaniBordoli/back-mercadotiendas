const mongoose = require('mongoose');
const { createReview, editReview } = require('../src/controllers/influencerReview.controller');
const InfluencerProfile = require('../src/models/InfluencerProfile');
const InfluencerReview = require('../src/models/InfluencerReview');

// Helper to create mock req/res
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('InfluencerReview Controller', () => {
  let influencerId;
  let companyId;
  beforeAll(async () => {
    const profile = await InfluencerProfile.create({ name: 'Influ', stats: { rating: 0, completedCampaigns: 0 } });
    influencerId = profile._id;
    companyId = new mongoose.Types.ObjectId();
  });

  afterEach(async () => {
    await InfluencerReview.deleteMany({});
    await InfluencerProfile.updateMany({}, { 'stats.rating': 0, 'stats.completedCampaigns': 0 });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('createReview debería crear la reseña y recalcular rating', async () => {
    const req = {
      body: {
        campaignId: new mongoose.Types.ObjectId().toString(),
        influencerId: influencerId.toString(),
        rating: 5,
        comment: 'Este influencer fue excelente, cumplió con todo a tiempo.' ,
        tags: ['content_quality']
      },
      user: { id: companyId.toString() }
    };
    const res = mockResponse();

    await createReview(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);

    // Verificar que la reseña existe en DB
    const reviews = await InfluencerReview.find({ influencerId });
    expect(reviews.length).toBe(1);

    // Verificar que el rating se recalculó
    const profile = await InfluencerProfile.findById(influencerId);
    expect(profile.stats.rating).toBe(5);
    expect(profile.stats.completedCampaigns).toBe(1);
  });

  it('createReview debería rechazar lenguaje inapropiado', async () => {
    const req = {
      body: {
        campaignId: new mongoose.Types.ObjectId().toString(),
        influencerId: influencerId.toString(),
        rating: 4,
        comment: 'Este influencer es una mierda',
      },
      user: { id: companyId.toString() }
    };
    const res = mockResponse();

    await createReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
  });

  it('editReview debería permitir editar dentro de 48h y actualizar rating', async () => {
    // Primero crear reseña
    const review = await InfluencerReview.create({
      campaignId: new mongoose.Types.ObjectId(),
      influencerId,
      companyId,
      rating: 3,
      comment: 'Buen trabajo en general',
      editableUntil: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    const req = {
      params: { id: review._id.toString() },
      body: { rating: 4, comment: 'Excelente trabajo' },
      user: { id: companyId.toString() }
    };
    const res = mockResponse();

    await editReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);

    const updatedReview = await InfluencerReview.findById(review._id);
    expect(updatedReview.rating).toBe(4);
    expect(updatedReview.status).toBe('edited');
    const profile = await InfluencerProfile.findById(influencerId);
    expect(profile.stats.rating).toBe(4);
  });
});