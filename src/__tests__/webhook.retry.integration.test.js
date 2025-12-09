const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const crypto = require('crypto');
const Payment = require('../../models/Payment');
const { handleWebhook } = require('../../controllers/payment.controller');

let mongoServer;

beforeAll(async () => {
  process.env.MOBBEX_AUDIT_KEY = 'audit_key_test';
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { dbName: 'jest' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const mkRes = () => {
  const out = { statusCode: 0, body: null };
  return {
    status: (code) => ({
      json: (data) => { out.statusCode = code; out.body = data; }
    }),
    _out: out
  };
};

test('webhook con firma inválida falla y reintento con firma válida procesa', async () => {
  const paymentId = 'CHK_WEBHOOK_SIG_1';
  const reference = 'order_webhook_sig_1';
  const userId = new mongoose.Types.ObjectId();

  await Payment.create({
    user: userId,
    mobbexId: paymentId,
    reference,
    amount: 100,
    currency: 'ARS',
    status: { code: '1', text: 'Creado' },
    paymentMethod: null,
    paymentData: {},
    items: [{
      productId: new mongoose.Types.ObjectId(),
      quantity: 1,
      unitPrice: 100,
      productName: 'Test',
      shopName: 'Shop'
    }]
  });

  const webhookBody = {
    type: 'payment.approved',
    data: {
      id: paymentId,
      reference,
      status: { code: '200', text: 'Pago aprobado' },
      payment_method: { name: 'Visa' },
      total: 100,
      currency: 'ARS',
      created: new Date().toISOString(),
      customer: { email: 'test@example.com', name: 'Tester' }
    }
  };

  const badReq = { headers: { 'x-signature': 'bad' }, body: webhookBody, app: { get: () => undefined } };
  const res1 = mkRes();
  await handleWebhook(badReq, res1);
  expect(res1._out.statusCode).toBe(200);
  const afterBad = await Payment.findOne({ mobbexId: paymentId });
  expect(afterBad.status.code).toBe('1');

  const goodSignature = crypto.createHmac('sha256', process.env.MOBBEX_AUDIT_KEY).update(JSON.stringify(webhookBody)).digest('hex');
  const goodReq = { headers: { 'x-signature': goodSignature }, body: webhookBody, app: { get: () => undefined } };
  const res2 = mkRes();
  await handleWebhook(goodReq, res2);
  expect(res2._out.statusCode).toBe(200);
  const afterGood = await Payment.findOne({ mobbexId: paymentId });
  expect(afterGood.status.code === '2' || afterGood.status.code === '200').toBe(true);
});

