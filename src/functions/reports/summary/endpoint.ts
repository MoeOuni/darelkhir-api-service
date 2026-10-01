import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { resolveGrant } from '@libs/auth/authorize';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { orderCountsAsDebt } from '@libs/balance';
import { shopBorneCharges } from '@libs/order-charges';
import { PaymentType, CheckStatus } from '@libs/enums';
import type { OrderEntity } from '@/entities/OrderEntity';

/**
 * The numbers a shop owner reads each morning.
 *
 * Everything is computed from the orders that carry an invoice — the same set
 * the client balances are built from — so the reports and the money-owed page
 * can never disagree.
 */

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

/** Start of today, this week (Monday) and this month, in ISO. */
function periodStarts(): { day: string; week: string; month: string } {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Monday as the first day: Sunday is a working day in Tunisia, Friday is not.
  const weekday = (day.getDay() + 6) % 7;
  const week = new Date(day);
  week.setDate(day.getDate() - weekday);

  const month = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    day: day.toISOString(),
    week: week.toISOString(),
    month: month.toISOString(),
  };
}

/**
 * What the shop charged for one line, before tax.
 *
 * An agreed price is written tax-included, because that is the number said out
 * loud when the deal is struck, so it has to be taken back out of the tax
 * before it can be set against a purchase price — those are always HT. Getting
 * this wrong counts the state's VAT as the shop's profit.
 */
function lineRevenueHT(item: { discountedPrice?: number; priceHT: number; taxRate: number }): number {
  return item.discountedPrice ? item.discountedPrice / (1 + item.taxRate / 100) : item.priceHT;
}

/** Revenue and margin for the orders inside a window. */
function summarise(orders: OrderEntity[], since: string) {
  const inWindow = orders.filter((o) => (o.invoiceIssuedAt ?? o.createdAt) >= since);

  // What was invoiced, tax and charges included: the turnover figure.
  let revenue = 0;
  // The goods alone, before tax. This is the only thing a purchase price can
  // honestly be subtracted from.
  let goodsHT = 0;
  let cost = 0;

  for (const order of inWindow) {
    revenue += order.total ?? 0;
    for (const item of order.items ?? []) {
      goodsHT += lineRevenueHT(item) * (item.quantity ?? 0);
      cost += (item.purchasePrice ?? 0) * (item.quantity ?? 0);
    }
    // The loader the shop paid itself is a real cost and belongs against the
    // margin, even though it never appeared on any invoice.
    cost += shopBorneCharges(order.charges);
  }

  return {
    orderCount: inWindow.length,
    revenue: round2(revenue),
    cost: round2(cost),
    // Goods only, HT. Transport and stamp duty are pass-through, and the VAT
    // on top is collected for the state — none of the three is margin, and
    // measuring against order.total counted all of them as if they were.
    margin: round2(goodsHT - cost),
  };
}

/** Whether a grant allows a permission. The owner holds everything. */
function holds(
  grant: { isOwner: boolean; permissions: string[] } | null,
  permission: string,
): boolean {
  return !!grant && (grant.isOwner || grant.permissions.includes(permission));
}

const reportsSummaryHandler = async (_event: ExtendedEvent, _context: Context) => {
  const orderRepository = new OrderRepository();

  const [allOrders, clientsPage, payments] = await Promise.all([
    orderRepository.listEveryOrder(),
    new ClientRepository().listAll(undefined, 500),
    new PaymentRepository().listAll(undefined, 500),
  ]);

  // Only invoiced, non-cancelled orders count as sales.
  const counted = allOrders.filter((o) =>
    orderCountsAsDebt({ status: o.status, creditNoteNumber: o.creditNoteNumber })
  );

  const starts = periodStarts();

  // ── Margin per product ────────────────────────────────────────────────
  const byProduct = new Map<
    string,
    { name: string; code: string; quantity: number; revenue: number; cost: number }
  >();

  for (const order of counted) {
    for (const item of order.items ?? []) {
      const key = item.productId;
      const row =
        byProduct.get(key) ??
        { name: item.name, code: item.code, quantity: 0, revenue: 0, cost: 0 };

      row.quantity += item.quantity ?? 0;
      row.revenue += lineRevenueHT(item) * (item.quantity ?? 0);
      row.cost += (item.purchasePrice ?? 0) * (item.quantity ?? 0);
      byProduct.set(key, row);
    }
  }

  const products = Array.from(byProduct.entries())
    .map(([productId, r]) => ({
      productId,
      name: r.name,
      code: r.code,
      quantity: r.quantity,
      revenue: round2(r.revenue),
      cost: round2(r.cost),
      margin: round2(r.revenue - r.cost),
      marginPercent: r.revenue > 0 ? round2(((r.revenue - r.cost) / r.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.margin - a.margin);

  // ── Money owed, bucketed by age ───────────────────────────────────────
  const debtors = clientsPage.items.filter((c) => (c.balance ?? 0) > 0);
  const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };

  for (const client of debtors) {
    const last = client.lastActivityAt ? new Date(client.lastActivityAt).getTime() : Date.now();
    const age = Math.floor((Date.now() - last) / 86_400_000);
    const amount = client.balance ?? 0;

    if (age < 30) buckets.current += amount;
    else if (age < 60) buckets.days30 += amount;
    else if (age < 90) buckets.days60 += amount;
    else buckets.days90plus += amount;
  }

  // ── Cash position ─────────────────────────────────────────────────────
  // A held cheque reduces what a client owes but is not money in the bank, so
  // it is reported separately rather than folded into what was received.
  let received = 0;
  let promised = 0;
  for (const p of payments.items) {
    if (p.method === PaymentType.CHECK && p.checkStatus === CheckStatus.HELD) {
      promised += p.amount ?? 0;
    } else {
      received += p.amount ?? 0;
    }
  }

  // `reports.view_sales` got the caller this far. Margin, supplier cost and
  // what clients owe are separate permissions, so they are cut out of the
  // answer rather than merely hidden by whatever screen asked for it.
  const grant = _event.user ? await resolveGrant(_event.user).catch(() => null) : null;
  const canSeeMargin = holds(grant, 'reports.view_margin');
  const canSeeDebt = holds(grant, 'payments.view');

  /** Drops cost and margin from a period when they are not allowed. */
  const period = (p: ReturnType<typeof summarise>) =>
    canSeeMargin ? p : { orderCount: p.orderCount, revenue: p.revenue };

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Report retrieved successfully',
      data: {
        today: period(summarise(counted, starts.day)),
        week: period(summarise(counted, starts.week)),
        month: period(summarise(counted, starts.month)),
        products: products.slice(0, 50).map((p) =>
          canSeeMargin
            ? p
            : {
                productId: p.productId,
                name: p.name,
                code: p.code,
                quantity: p.quantity,
                revenue: p.revenue,
              },
        ),
        debt: canSeeDebt
          ? {
              total: round2(debtors.reduce((s, c) => s + (c.balance ?? 0), 0)),
              clientCount: debtors.length,
              buckets: {
                current: round2(buckets.current),
                days30: round2(buckets.days30),
                days60: round2(buckets.days60),
                days90plus: round2(buckets.days90plus),
              },
            }
          : undefined,
        cash: canSeeDebt ? { received: round2(received), promised: round2(promised) } : undefined,
      },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'reports.view_sales',
  cors: true,
})(reportsSummaryHandler);
