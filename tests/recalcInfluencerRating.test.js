const mongoose = require('mongoose');
const InfluencerProfile = require('../src/models/InfluencerProfile');
const InfluencerReview = require('../src/models/InfluencerReview');
const { recalcInfluencerRating } = require('../src/controllers/influencerReview.controller');

describe('recalcInfluencerRating', () => {
  let influencerId;

  beforeAll(async () => {
    const profile = await InfluencerProfile.create({ name: 'Test', stats: { rating: 0, completedCampaigns: 0 } });
    influencerId = profile._id;
  });

  afterEach(async () => {
    await InfluencerReview.deleteMany({});
    await InfluencerProfile.updateMany({}, { 'stats.rating': 0, 'stats.completedCampaigns': 0 });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
  });

  it('calculates average rating correctly', async () => {
    await InfluencerReview.create([
      { influencerId, rating: 4, status: 'published' },
      { influencerId, rating: 2, status: 'published' },
      { influencerId, rating: 5, status: 'hidden' }, // should be ignored
    ]);

    await recalcInfluencerRating(influencerId);
    const updated = await InfluencerProfile.findById(influencerId);
    expect(updated.stats.rating).toBe(3); // (4+2)/2
    expect(updated.stats.completedCampaigns).toBe(2);
  });
});