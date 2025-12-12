const jestMock = require('jest-mock');

jest.mock('mobbex', () => {
  const transactions = {
    search: jestMock.fn().mockResolvedValue({
      operations: [
        {
          id: 'op_test_123',
          status: '200',
          payment_method: { name: 'Tarjeta de Prueba' },
          total: 1500,
          currency: 'TEST',
          created: new Date().toISOString(),
          reference: 'order_123'
        }
      ]
    })
  };
  return {
    mobbex: {
      configurations: { configure: jestMock.fn() },
      transactions,
      checkout: { create: jestMock.fn() }
    }
  };
});

const { checkPaymentStatus } = require('../../services/mobbex.service');

describe('Mobbex Service - checkPaymentStatus', () => {
  test('mapea correctamente una operación encontrada', async () => {
    const res = await checkPaymentStatus('op_test_123');
    expect(res).toBeDefined();
    expect(res.id).toBe('op_test_123');
    expect(res.status.code).toBe('200');
    expect(res.paymentMethod).toBe('Tarjeta de Prueba');
    expect(typeof res.amount).toBe('number');
    expect(res.currency).toBe('TEST');
    expect(res.reference).toBe('order_123');
  });
});

