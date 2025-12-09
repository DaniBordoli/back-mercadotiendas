const jestMock = require('jest-mock');

jest.mock('mobbex', () => {
  const calls = [];
  const checkout = {
    create: jestMock.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('network'), { code: 'ECONNRESET' })), 50)))
      .mockImplementationOnce(() => Promise.resolve({ data: { id: 'CHK_TEST_123', url: 'https://mobbex.com/p/checkout/CHK_TEST_123', redirectUrl: 'https://mobbex.com/p/checkout/CHK_TEST_123' } }))
  };
  const transactions = { search: jestMock.fn() };
  return {
    mobbex: {
      configurations: { configure: jestMock.fn() },
      checkout,
      transactions,
    }
  };
});

const { createCheckout } = require('../../services/mobbex.service');

describe('Retry/Backoff Mobbex checkout', () => {
  test('reintenta ante timeout y error de red y finalmente resuelve', async () => {
    const orderData = { total: 100, description: 'Prueba', reference: 'order_retry_1' };
    const customerData = { email: 't@e.com', name: 'Test', identification: '123' };
    const items = [{ name: 'X', description: 'Y', quantity: 1, price: 100 }];
    const res = await createCheckout(orderData, customerData, items, { mobbexApiKey: 'k', mobbexAccessToken: 't' });
    expect(res.success).toBe(true);
    expect(res.data.id).toBe('CHK_TEST_123');
  });
});

