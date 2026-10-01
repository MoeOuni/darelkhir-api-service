import { computeBalance, orderCountsAsDebt } from '@libs/balance';
import { OrderStatus } from '@libs/enums';

/**
 * The worked example the owner described: a 10,000 order, 5,000 paid, then
 * 2,000 more, leaving 3,000. The balance lives on the client, not the order.
 */

const D = (n: number) => `2026-0${n}-01T00:00:00.000Z`;

describe('what counts as money owed', () => {
  it('counts an order from confirmed onward', () => {
    for (const status of [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CLOSED,
    ]) {
      expect(orderCountsAsDebt({ status })).toBe(true);
    }
  });

  it('does not count a draft: no invoice exists yet', () => {
    expect(orderCountsAsDebt({ status: OrderStatus.DRAFT })).toBe(false);
    expect(orderCountsAsDebt({ status: OrderStatus.PENDING })).toBe(false);
  });

  it('does not count a cancelled order', () => {
    expect(orderCountsAsDebt({ status: OrderStatus.CANCELLED })).toBe(false);
  });

  it('stops counting an order once a credit note cancels it', () => {
    expect(
      orderCountsAsDebt({ status: OrderStatus.DELIVERED, creditNoteNumber: 4 })
    ).toBe(false);
  });
});

describe('the client balance', () => {
  it('follows the 10,000 / 5,000 / 2,000 example', () => {
    const orders = [
      { status: OrderStatus.CONFIRMED, total: 10000, createdAt: D(3) },
    ];

    const afterFirst = computeBalance(orders, [{ amount: 5000, paidAt: D(3) }]);
    expect(afterFirst.balance).toBe(5000);

    const afterSecond = computeBalance(orders, [
      { amount: 5000, paidAt: D(3) },
      { amount: 2000, paidAt: D(4) },
    ]);
    expect(afterSecond.totalInvoiced).toBe(10000);
    expect(afterSecond.totalPaid).toBe(7000);
    expect(afterSecond.balance).toBe(3000);
  });

  it('adds up several orders into one number', () => {
    const balance = computeBalance(
      [
        { status: OrderStatus.CONFIRMED, total: 1200.5, createdAt: D(1) },
        { status: OrderStatus.DELIVERED, total: 800.25, createdAt: D(2) },
        { status: OrderStatus.DRAFT, total: 999, createdAt: D(3) },
      ],
      [{ amount: 500, paidAt: D(2) }]
    );

    // The draft is excluded.
    expect(balance.totalInvoiced).toBe(2000.75);
    expect(balance.balance).toBe(1500.75);
  });

  it('puts the balance back up when a payment is reversed', () => {
    const orders = [{ status: OrderStatus.CONFIRMED, total: 3000, createdAt: D(1) }];

    const paid = computeBalance(orders, [{ amount: 3000, paidAt: D(1) }]);
    expect(paid.balance).toBe(0);

    // A returned check is a second record with a negative amount, never a
    // deletion of the first.
    const reversed = computeBalance(orders, [
      { amount: 3000, paidAt: D(1) },
      { amount: -3000, paidAt: D(2) },
    ]);
    expect(reversed.balance).toBe(3000);
    expect(reversed.totalPaid).toBe(0);
  });

  it('drops the debt when a credit note cancels the order', () => {
    const balance = computeBalance(
      [
        { status: OrderStatus.CONFIRMED, total: 500, createdAt: D(1) },
        { status: OrderStatus.CANCELLED, total: 700, creditNoteNumber: 1, createdAt: D(2) },
      ],
      []
    );
    expect(balance.balance).toBe(500);
  });

  it('shows a negative balance when a client overpays', () => {
    const balance = computeBalance(
      [{ status: OrderStatus.CONFIRMED, total: 100, createdAt: D(1) }],
      [{ amount: 150, paidAt: D(1) }]
    );
    expect(balance.balance).toBe(-50);
  });

  it('does not drift over many small amounts', () => {
    const orders = Array.from({ length: 30 }, () => ({
      status: OrderStatus.CONFIRMED,
      total: 0.1,
      createdAt: D(1),
    }));
    expect(computeBalance(orders, []).totalInvoiced).toBe(3);
  });

  it('reports the date of the last movement', () => {
    const balance = computeBalance(
      [{ status: OrderStatus.CONFIRMED, total: 100, createdAt: D(1) }],
      [{ amount: 40, paidAt: D(5) }]
    );
    expect(balance.lastActivityAt).toBe(D(5));
  });

  it('is zero for a client with nothing', () => {
    const balance = computeBalance([], []);
    expect(balance).toEqual({
      totalInvoiced: 0,
      totalPaid: 0,
      openingBalance: 0,
      balance: 0,
      lastActivityAt: undefined,
    });
  });

  /**
   * A debt carried over from the notebook: an amount, with no order behind it.
   *
   * It has to be owed, and it must not look like a sale — those goods left the
   * shop before the system existed and have no purchase price recorded, so
   * counting them in `totalInvoiced` would show a profit that was never made.
   */
  describe('a debt carried over from the notebook', () => {
    it('is owed without being counted as a sale', () => {
      const balance = computeBalance([], [], 4300);

      expect(balance.balance).toBe(4300);
      expect(balance.totalInvoiced).toBe(0);
      expect(balance.openingBalance).toBe(4300);
    });

    it('sits on top of what he has bought since', () => {
      const balance = computeBalance(
        [{ status: OrderStatus.DELIVERED, total: 1000, createdAt: '2026-01-02' }],
        [],
        4300,
      );

      expect(balance.balance).toBe(5300);
      expect(balance.totalInvoiced).toBe(1000);
    });

    it('is paid off by payments like any other debt', () => {
      const balance = computeBalance([], [{ amount: 4300, paidAt: '2026-01-03' }], 4300);

      expect(balance.balance).toBe(0);
    });

    it('leaves an advance when he pays more than he owed', () => {
      const balance = computeBalance([], [{ amount: 5000, paidAt: '2026-01-03' }], 4300);

      expect(balance.balance).toBe(-700);
    });

    it('changes nothing for a client who has none', () => {
      expect(computeBalance([], []).balance).toBe(computeBalance([], [], 0).balance);
    });
  });
});
