/**
 * The invoice counter must start at 1 on a fresh database.
 *
 * It used to seed itself from the order counter, so that a system already in
 * use would carry on from the numbers customers had been given. That reads a
 * value which moves: after the database was cleared, creating order 1 set the
 * order counter to 1, and the first invoice then came out as 2.
 *
 * These tests pin the behaviour with a fake DynamoDB that implements ADD.
 */

const sent: any[] = [];
const counters: Record<string, number> = {};

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: (command: any) => {
      sent.push(command);
      const { Key, UpdateExpression, ExpressionAttributeValues } = command.input;
      const key = `${Key.id.S}#${Key.sk.S}`;

      const add = /ADD (\w+) :inc/.exec(UpdateExpression);
      if (add) {
        const field = add[1];
        const by = Number(ExpressionAttributeValues[':inc'].N);
        counters[key] = (counters[key] ?? 0) + by;
        return Promise.resolve({ Attributes: { [field]: { N: String(counters[key]) } } });
      }
      return Promise.resolve({});
    },
  })),
  UpdateItemCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OrderRepository } = require('@/repositories/OrderRepository');

describe('order and invoice counters', () => {
  beforeEach(() => {
    sent.length = 0;
    for (const k of Object.keys(counters)) delete counters[k];
  });

  it('starts the invoice sequence at 1 on an empty database', async () => {
    const repo = new OrderRepository();

    // An order is created first, exactly as the real flow does.
    expect(await repo.incrementCounter()).toBe(1);
    // Confirming it issues the first invoice.
    expect(await repo.incrementInvoiceCounter()).toBe(1);
  });

  it('never derives the invoice number from the order counter', async () => {
    const repo = new OrderRepository();

    // Three orders created, only the third confirmed.
    await repo.incrementCounter();
    await repo.incrementCounter();
    await repo.incrementCounter();

    expect(await repo.incrementInvoiceCounter()).toBe(1);
    expect(await repo.incrementInvoiceCounter()).toBe(2);

    // Nothing in the invoice path may read the ORDER counter.
    const readsOrderCounter = sent.some(
      (c) =>
        c.input.Key.sk.S === 'ORDER' &&
        !/ADD orderCount/.test(c.input.UpdateExpression ?? '')
    );
    expect(readsOrderCounter).toBe(false);
  });

  it('keeps the three sequences independent', async () => {
    const repo = new OrderRepository();

    await repo.incrementCounter();
    await repo.incrementCounter();

    expect(await repo.incrementInvoiceCounter()).toBe(1);
    expect(await repo.incrementCreditNoteCounter()).toBe(1);
    expect(await repo.incrementCounter()).toBe(3);
  });
});
