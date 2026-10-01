import { CreateCreditNoteUseCase } from '@/functions/orders/creditNote/useCase';
import { OrderEntity } from '@/entities/OrderEntity';
import { DataType, OrderStatus, PaymentMethod, StockMovementType } from '@libs/enums';
import { recordStockMovements } from '@libs/journal';

/**
 * Cancelling an invoiced order has to show up in the stock history.
 *
 * There are two ways an order dies. A draft is cancelled by its status, and
 * that path put the goods back and wrote down why. An invoiced one can only be
 * undone by a credit note — and that path put the goods back and said nothing.
 *
 * So the shelf count was right and the history showed only the sale. A worker
 * reading it could not tell a returned order from a miscount, and the shop's
 * own report of what moved that day was missing every cancellation in it.
 */

jest.mock('@libs/journal', () => ({
  recordStockMovements: jest.fn(async () => undefined),
}));

// The balance is recomputed from the orders and the payments, which is a
// different question from where the goods went.
jest.mock('@libs/balance', () => ({
  recalculateClientBalance: jest.fn(async () => ({})),
}));

const ORDER_ID = '2b1f6c88-3d4a-4e7b-9c15-8a6d2f0e4b77';
const CREDIT_NOTE_NUMBER = 4;

const items = [
  {
    productId: 'p-fg27',
    code: 'FG27',
    name: 'Fil galvanisé (épaisseur 2.7 mm) (en kg)',
    purchasePrice: 3,
    priceHT: 4.034,
    priceTTC: 4.8,
    taxRate: 19,
    quantity: 200,
  },
  {
    productId: 'p-cgdt20',
    code: 'CGDT20',
    name: 'Clôture grillage double torsion (20m x 2m)',
    purchasePrice: 60,
    priceHT: 84.034,
    priceTTC: 100,
    taxRate: 19,
    quantity: 45,
  },
];

const order = (over: Partial<Record<string, unknown>> = {}) =>
  new OrderEntity({
    id: DataType.ORDER,
    sk: `${DataType.ORDER}#${ORDER_ID}`,
    dataType: DataType.ORDER,
    orderNumber: 5,
    clientId: 'cl-1',
    clientName: 'Abd Elkhalk Salhi',
    customerId: 'cl-1',
    status: OrderStatus.CONFIRMED,
    invoiceNumber: 5,
    invoiceIssuedAt: '2026-08-29T05:56:00.000Z',
    items: items as never,
    subtotal: 4588,
    tax: 871.72,
    timber: 1,
    transport: 0,
    total: 5460.72,
    shippingAddress: { street: 'Route de Gafsa' },
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    createdAt: '2026-08-29T05:56:00.000Z',
    updatedAt: '2026-08-29T05:56:00.000Z',
    ...(over as object),
  });

function harness(entity: OrderEntity) {
  const restocked: { productId: string; delta: number }[] = [];

  const orders = {
    findByUuid: async () => entity,
    incrementCreditNoteCounter: async () => CREDIT_NOTE_NUMBER,
    update: async () => ({}),
  };
  const products = {
    updateStock: async (productId: string, delta: number) => {
      restocked.push({ productId, delta });
    },
  };
  const clients = {};

  const useCase = new CreateCreditNoteUseCase(
    orders as never,
    products as never,
    clients as never,
  );

  return { useCase, restocked };
}

const movements = () =>
  (recordStockMovements as jest.Mock).mock.calls[0]?.[0] as Record<string, any>[];

beforeEach(() => jest.clearAllMocks());

describe('a credit note that puts the goods back', () => {
  it('writes one return per line, so the history explains the count', async () => {
    const { useCase, restocked } = harness(order());

    await useCase.execute(ORDER_ID, { reason: 'Refus à la livraison' });

    expect(restocked).toEqual([
      { productId: 'p-fg27', delta: 200 },
      { productId: 'p-cgdt20', delta: 45 },
    ]);

    expect(movements()).toHaveLength(2);
    expect(movements()[0]).toMatchObject({
      productId: 'p-fg27',
      productCode: 'FG27',
      type: StockMovementType.RETURN,
      // Positive: the goods come back onto the shelf.
      availableDelta: 200,
      orderNumber: 5,
    });
  });

  it('names the credit note and the order it undoes', async () => {
    const { useCase } = harness(order());

    await useCase.execute(ORDER_ID, {});

    // What the worker reads in the Motif column.
    expect(movements()[0].reason).toBe('Avoir AV-004 — commande #5');
  });

  it('records who did it, so the entry is not anonymous', async () => {
    const { useCase } = harness(order());

    await useCase.execute(ORDER_ID, {}, { sub: 'u-1', name: 'Rabie Ouni' } as never);

    expect(movements()[0].actor).toMatchObject({ name: 'Rabie Ouni' });
  });
});

describe('a credit note that leaves the goods where they are', () => {
  it('writes nothing when the shop keeps them', async () => {
    // The client kept the goods and only the paper is being undone.
    const { useCase, restocked } = harness(order());

    await useCase.execute(ORDER_ID, { restock: false });

    expect(restocked).toEqual([]);
    expect(recordStockMovements).not.toHaveBeenCalled();
  });

  it('does not put back what was already put back', async () => {
    // The order was cancelled first and the credit note follows, the paperwork
    // catching up with a decision already taken. Restocking again would invent
    // stock the shop does not have — and the history would claim it twice.
    const { useCase, restocked } = harness(order({ status: OrderStatus.CANCELLED }));

    await useCase.execute(ORDER_ID, {});

    expect(restocked).toEqual([]);
    expect(recordStockMovements).not.toHaveBeenCalled();
  });
});
