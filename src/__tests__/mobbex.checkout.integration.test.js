const nock = require('nock');
process.env.MOBBEX_API_KEY = 'test_api_key';
process.env.MOBBEX_ACCESS_TOKEN = 'test_access_token';

const { createCheckout } = require('../../services/mobbex.service');

describe('Integración sandbox: checkout', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });
  afterAll(() => {
    nock.enableNetConnect();
    nock.cleanAll();
  });

  test('crea checkout y devuelve url/redirectUrl', async () => {
    const scope = nock('https://api.mobbex.com')
      .post('/p/checkout', body => !!body && !!body.return_url)
      .reply(200, { result: true, data: { id: 'CHK_SANDBOX_1', url: 'https://mobbex.com/p/checkout/CHK_SANDBOX_1', redirectUrl: 'https://mobbex.com/p/checkout/CHK_SANDBOX_1' } });

    const orderData = { total: 50, description: 'Sandbox', reference: 'order_sandbox_1' };
    const customerData = { email: 'sandbox@example.com', name: 'Sandbox', identification: '1234' };
    const items = [{ name: 'Prod', description: 'Desc', quantity: 1, price: 50 }];

    const res = await createCheckout(orderData, customerData, items);
    expect(res.success).toBe(true);
    expect(res.data.id).toBe('CHK_SANDBOX_1');
    expect(res.data.url).toMatch(/mobbex\.com\/p\/checkout/);
    expect(scope.isDone()).toBe(true);
  });
});

