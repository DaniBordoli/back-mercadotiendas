const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Payment = require('../../models/Payment');
const { handleWebhook } = require('../../controllers/payment.controller');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { dbName: 'jest' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('no reprocesa un pago ya aprobado (idempotencia)', async () => {
  const paymentId = 'op_abc_123';
  const reference = 'order_abc_123';

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

  const baseReq = {
    headers: {},
    body: {
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
    },
    app: { get: () => undefined }
  };

  const mkRes = () => {
    const out = { statusCode: 0, body: null };
    return {
      status: (code) => ({
        json: (data) => { out.statusCode = code; out.body = data; }
      }),
      _out: out
    };
  };

  const res1 = mkRes();
  await handleWebhook(baseReq, res1);
  const afterFirst = await Payment.findOne({ mobbexId: paymentId });
  expect(afterFirst.status.code === '2' || afterFirst.status.code === '200').toBe(true);

  const res2 = mkRes();
  await handleWebhook(baseReq, res2);
  expect(res2._out.statusCode).toBe(200);
  expect(res2._out.body && res2._out.body.message).toMatch(/Pago ya procesado/);
});

