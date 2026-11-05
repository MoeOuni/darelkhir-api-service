/**
 * The investor report's figures, worked out from the shop's own records.
 *
 * Pure: it takes the rows as they are stored and returns numbers, so it can be
 * checked against a hand-made example without a database.
 *
 * Everything is valued at each product's current purchase price. That keeps
 * the one identity the report rests on true by construction — what was bought
 * equals what was sold plus what is left, both at cost — and it means a cost
 * corrected in the app is corrected everywhere in the report at once.
 */

export type Row = Record<string, any>;

export type ReportSource = {
  generatedAt: string;
  /** The money the investors put in. Not recorded anywhere else in the app. */
  investment: number;
  products: Row[];
  categories: Row[];
  /** STOCK_MOVEMENT rows from the journal. */
  movements: Row[];
  /** ORDER rows only, not the counters stored beside them. */
  orders: Row[];
  payments: Row[];
  /** CLIENT rows only. */
  clients: Row[];
  /** How many prices are pinned to a client's file. */
  agreedPrices: number;
  /** Money that left the shop and bought no stock. */
  charges: Row[];
  /** Goods bought and not fully paid for. */
  supplierDebts: Row[];
};

export type Check = { ok: boolean; title: string; detail: string };

const SOLD = new Set(['delivered', 'shipped', 'confirmed']);
const OTHER = 'Sans catégorie';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** 1 369,500 — the way the shop's own papers write money. */
export function fr3(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(3).split('.');
  return `${n < -0.0005 ? '−' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${dec}`;
}
const frDate = (iso: string) => day(iso).split('-').reverse().join('/');
const day = (iso: string) => (iso || '').slice(0, 10);
const uuidOf = (sk: string) => String(sk ?? '').split('#')[1] ?? '';

/** Monday of the week a date falls in, as YYYY-MM-DD. */
function weekStart(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function weekLabel(start: string, end: string): string {
  const [, m1, d1] = start.split('-').map(Number);
  const [, m2, d2] = end.split('-').map(Number);
  return m1 === m2
    ? `${d1}–${d2} ${MONTHS[m1 - 1]}`
    : `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]}`;
}

export function computeInvestorReport(src: ReportSource) {
  const today = day(src.generatedAt);
  const catName = new Map(src.categories.map((c) => [uuidOf(c.sk), (c.name?.fr ?? '').trim()]));
  const products = new Map<string, Row>(src.products.map((p) => [p.code, p]));
  const family = (code: string) => {
    const name = catName.get(products.get(code)?.categoryId) || OTHER;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const cost = (code: string) => Number(products.get(code)?.purchasePrice ?? 0) || 0;

  const movements = [...src.movements].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const orders = [...src.orders].sort((a, b) => a.orderNumber - b.orderNumber);
  const byOrderId = new Map(orders.map((o) => [uuidOf(o.sk), o]));

  const sales = orders.filter((o) => SOLD.has(o.status) && o.invoiceNumber);
  const pending = orders.filter((o) => o.status === 'pending');
  const cancelled = orders.filter((o) => o.status === 'cancelled');

  // ── What came in ───────────────────────────────────────────────────────
  // Everything that is not a sale or a return: supplier imports, opening
  // stock, manual corrections in either direction, recorded losses.
  const flows = new Map<string, Record<string, number>>();
  const unitsIn = new Map<string, number>();
  const firstIn = new Map<string, string>();
  for (const m of movements) {
    const f = flows.get(m.productCode) ?? {};
    f[m.type] = (f[m.type] ?? 0) + Number(m.availableDelta || 0);
    flows.set(m.productCode, f);
    if (m.type !== 'sale' && m.type !== 'return') {
      unitsIn.set(m.productCode, (unitsIn.get(m.productCode) ?? 0) + Number(m.availableDelta || 0));
      if (!firstIn.has(m.productCode)) firstIn.set(m.productCode, m.createdAt);
    }
  }

  const purchases = [...products.values()]
    .map((p) => {
      const units = unitsIn.get(p.code) ?? 0;
      return { code: p.code, name: p.name?.fr ?? p.code, family: family(p.code), date: firstIn.get(p.code) ?? p.createdAt,
               units, unitCost: cost(p.code), total: r3(units * cost(p.code)) };
    })
    .filter((x) => x.units !== 0)
    .sort((a, b) => a.family.localeCompare(b.family) || b.total - a.total);
  const spent = r3(purchases.reduce((s, x) => s + x.total, 0));
  const unitsBought = purchases.reduce((s, x) => s + x.units, 0);

  // ── What was sold ──────────────────────────────────────────────────────
  const saleLines = sales
    .flatMap((o) =>
      (o.items ?? []).map((it: Row) => {
        const qty = Number(it.quantity);
        const list = Number(it.priceTTC);
        const price = Number(it.discountedPrice || it.priceTTC);
        const unitCost = cost(it.code);
        return {
          invoice: Number(o.invoiceNumber), order: Number(o.orderNumber), date: o.invoiceIssuedAt || o.createdAt,
          client: o.clientName ?? '', code: it.code, name: products.get(it.code)?.name?.fr ?? it.name ?? it.code,
          family: family(it.code), qty, list, price, revenue: r3(qty * price), discount: r3(qty * (list - price)),
          cost: r3(qty * unitCost), margin: r3(qty * (price - unitCost)), status: o.status,
        };
      }),
    )
    .sort((a, b) => day(a.date).localeCompare(day(b.date)) || a.invoice - b.invoice);

  const revenue = r3(saleLines.reduce((s, l) => s + l.revenue, 0));
  const cogs = r3(saleLines.reduce((s, l) => s + l.cost, 0));
  const listValue = r3(saleLines.reduce((s, l) => s + l.qty * l.list, 0));
  const unitsSold = saleLines.reduce((s, l) => s + l.qty, 0);
  const stamps = r3(sales.reduce((s, o) => s + Number(o.timber || 0), 0));
  const invoiced = r3(sales.reduce((s, o) => s + Number(o.total || 0), 0));

  // Weekly while the shop is young; by month once a weekly chart would crowd.
  const firstSale = saleLines.length ? day(saleLines[0].date) : today;
  const buckets: { label: string; from: string; to: string }[] = [];
  for (let start = weekStart(firstSale); start <= today; ) {
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const to = end.toISOString().slice(0, 10);
    buckets.push({ label: weekLabel(start, to < today ? to : today), from: start, to });
    end.setUTCDate(end.getUTCDate() + 1);
    start = end.toISOString().slice(0, 10);
  }
  const periods =
    buckets.length <= 12
      ? buckets
      : [...new Set(saleLines.map((l) => day(l.date).slice(0, 7)))].sort().map((ym) => {
          const [y, m] = ym.split('-').map(Number);
          return { label: `${MONTHS[m - 1]} ${y}`, from: `${ym}-01`, to: `${ym}-31` };
        });
  const timeline = periods.map((p) => {
    const lines = saleLines.filter((l) => day(l.date) >= p.from && day(l.date) <= p.to);
    return { label: p.label, revenue: r3(lines.reduce((s, l) => s + l.revenue, 0)),
             margin: r3(lines.reduce((s, l) => s + l.margin, 0)), invoices: new Set(lines.map((l) => l.invoice)).size };
  });

  // ── Money in ───────────────────────────────────────────────────────────
  const payments = [...src.payments].sort((a, b) =>
    String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)));
  const recordedIn = r3(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  const clientName = new Map(src.clients.map((c) => [uuidOf(c.sk), c.fullName ?? '']));

  const seen = new Map<string, number>();
  const paymentRows = payments.map((p) => {
    const order = byOrderId.get(p.orderId ?? '');
    const key = `${p.orderId}|${Number(p.amount)}|${day(p.paidAt || p.createdAt)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    let flag = '';
    if (order && Number(p.amount) > 0 && seen.get(key)! > 1) flag = 'Doublon : même commande, même montant, même jour';
    else if (order && order.status === 'cancelled' && Number(p.amount) > 0) flag = 'Paiement d’une commande annulée, jamais annulé ni remboursé';
    return { date: p.paidAt || p.createdAt, amount: Number(p.amount), method: p.method, order: order ? Number(order.orderNumber) : null,
             client: clientName.get(p.clientId) || order?.clientName || '', flag };
  });
  const flaggedAmount = r3(paymentRows.filter((r) => r.flag).reduce((s, r) => s + r.amount, 0));

  // What clients still owe, and what the app says the shop owes them.
  const owing = src.clients.filter((c) => Number(c.balance) > 0.0005)
    .map((c) => ({ client: c.fullName, amount: r3(Number(c.balance)) }));
  const credits = src.clients.filter((c) => Number(c.balance) < -0.0005)
    .map((c) => ({ client: c.fullName, amount: r3(-Number(c.balance)) }));
  const receivable = r3(owing.reduce((s, c) => s + c.amount, 0));
  const expectedIn = r3(invoiced - receivable);

  // ── What is left ───────────────────────────────────────────────────────
  // A pending order has already taken its units off the shelf count, but they
  // are still in the shop and still the shop's.
  const reserved = new Map<string, number>();
  for (const o of pending) for (const it of o.items ?? []) {
    reserved.set(it.code, (reserved.get(it.code) ?? 0) + Number(it.quantity));
  }
  const stock = [...products.values()]
    .map((p) => {
      const onHand = Number(p.stockAvailable || 0) + (reserved.get(p.code) ?? 0);
      const price = Number(p.discountedPrice || p.priceTTC || 0);
      return { code: p.code, name: p.name?.fr ?? p.code, family: family(p.code), onHand, reserved: reserved.get(p.code) ?? 0,
               unitCost: cost(p.code), valueCost: r3(onHand * cost(p.code)), price, valuePrice: r3(onHand * price) };
    })
    .filter((s) => s.onHand > 0)
    .sort((a, b) => b.valueCost - a.valueCost);
  const stockCost = r3(stock.reduce((s, x) => s + x.valueCost, 0));
  const stockPrice = r3(stock.reduce((s, x) => s + x.valuePrice, 0));
  const unitsOnHand = stock.reduce((s, x) => s + x.onHand, 0);

  // ── By family ──────────────────────────────────────────────────────────
  const familyNames = [...new Set([...purchases.map((x) => x.family), ...stock.map((x) => x.family)])].sort();
  const families = familyNames.map((name) => ({
    name,
    refs: purchases.filter((x) => x.family === name).length,
    unitsIn: purchases.filter((x) => x.family === name).reduce((s, x) => s + x.units, 0),
    spent: r3(purchases.filter((x) => x.family === name).reduce((s, x) => s + x.total, 0)),
    unitsSold: saleLines.filter((l) => l.family === name).reduce((s, l) => s + l.qty, 0),
    revenue: r3(saleLines.filter((l) => l.family === name).reduce((s, l) => s + l.revenue, 0)),
    cogs: r3(saleLines.filter((l) => l.family === name).reduce((s, l) => s + l.cost, 0)),
    unitsOnHand: stock.filter((x) => x.family === name).reduce((s, x) => s + x.onHand, 0),
    stockCost: r3(stock.filter((x) => x.family === name).reduce((s, x) => s + x.valueCost, 0)),
    stockPrice: r3(stock.filter((x) => x.family === name).reduce((s, x) => s + x.valuePrice, 0)),
  }));

  // ── Traceability ───────────────────────────────────────────────────────
  const reconciliation = [...products.values()]
    .filter((p) => flows.has(p.code) || Number(p.stockAvailable) !== 0)
    .map((p) => {
      const f = flows.get(p.code) ?? {};
      const entered = (f.purchase ?? 0) + (f.initial ?? 0);
      const corrected = (f.adjustment ?? 0) + (f.loss ?? 0);
      const computed = Object.values(f).reduce((s, n) => s + n, 0);
      return { code: p.code, name: p.name?.fr ?? p.code, family: family(p.code), entered, corrected,
               out: f.sale ?? 0, back: f.return ?? 0, inApp: Number(p.stockAvailable || 0), gap: Number(p.stockAvailable || 0) - computed };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code));

  // ── Money out ──────────────────────────────────────────────────────────
  // Charges written down, plus what the shop paid out on its own orders — a
  // loader, a crane. Those already come off the margin in the sales reports,
  // under the same rule: invoiced orders that were not cancelled. What a client
  // settled with the loader directly was never the shop's money.
  const chargeRows = [
    ...src.charges.map((c) => ({ date: String(c.date), category: String(c.category), beneficiary: c.beneficiary ?? '',
                                 description: c.description ?? '', amount: Number(c.amount), method: String(c.method ?? 'cash') })),
    ...sales.flatMap((o) => (o.charges ?? []).filter((c: Row) => c.paidBy === 'shop').map((c: Row) => ({
      date: day(o.invoiceIssuedAt || o.createdAt), category: 'order', beneficiary: '', description: `${c.label} (commande #${o.orderNumber})`,
      amount: Number(c.amount), method: 'cash' }))),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const charges = r3(chargeRows.reduce((s, c) => s + c.amount, 0));
  const chargesByCategory = [...new Set(chargeRows.map((c) => c.category))]
    .map((category) => ({ category, count: chargeRows.filter((c) => c.category === category).length,
                          total: r3(chargeRows.filter((c) => c.category === category).reduce((s, c) => s + c.amount, 0)) }))
    .sort((a, b) => b.total - a.total);

  // A purchase with no debt against it was paid in full; a debt says how much
  // of one was not. So what was actually paid is the goods minus what is owed.
  const debts = [...src.supplierDebts]
    .map((d) => ({ supplierName: d.supplierName ?? '', reference: d.reference ?? '', date: String(d.date), total: Number(d.total), paid: Number(d.paid ?? 0),
                   remaining: r3(Number(d.total) - Number(d.paid ?? 0)), payments: (d.payments ?? []) as Row[] }))
    .sort((a, b) => b.remaining - a.remaining || b.date.localeCompare(a.date));
  const supplierDebt = r3(debts.reduce((s, d) => s + d.remaining, 0));
  const paidToSuppliers = r3(spent - supplierDebt);

  const margin = r3(revenue - cogs);
  const identityGap = r3(spent - cogs - stockCost);
  const cashEstimate = r3(src.investment - paidToSuppliers + expectedIn - charges);
  const position = r3(stockCost + cashEstimate + receivable);

  // ── Checks ─────────────────────────────────────────────────────────────
  const checks: Check[] = [];
  const stockGaps = reconciliation.filter((r) => Math.abs(r.gap) > 1e-9);
  checks.push(stockGaps.length
    ? { ok: false, title: `Stock incohérent pour ${stockGaps.length} article(s)`,
        detail: stockGaps.map((r) => `${r.code} : ${r.inApp} dans l’application, ${r.inApp - r.gap} d’après les mouvements`).join(' ; ') }
    : { ok: true, title: 'Le stock se recoupe', detail: `Pour chacun des ${reconciliation.length} articles suivis, les entrées moins les sorties donnent exactement le stock enregistré.` });
  checks.push(Math.abs(identityGap) < 0.001
    ? { ok: true, title: 'Les achats se retrouvent', detail: 'Les achats au coût égalent le coût des ventes plus le stock restant, au millime.' }
    : { ok: false, title: 'Écart entre achats, ventes et stock', detail: `${fr3(identityGap)} DT ne se retrouvent ni dans les ventes ni dans le stock.` });
  for (const r of paymentRows.filter((x) => x.flag)) {
    checks.push({ ok: false, title: `${r.flag.split(' :')[0].split(',')[0]}, commande #${r.order}`,
                  detail: `${r.client} : ${fr3(r.amount)} DT le ${frDate(r.date)}. ${r.flag}.` });
  }
  // A credit already explained by a flagged payment is the same problem; it
  // is said once, against the payment that caused it.
  const explained = new Set(paymentRows.filter((r) => r.flag).map((r) => r.client));
  for (const c of credits.filter((c) => !explained.has(c.client))) {
    checks.push({ ok: false, title: `Avoir client : ${c.client}`,
                  detail: `D’après l’application, le magasin lui doit ${fr3(c.amount)} DT. À vérifier : c’est souvent un paiement enregistré en trop.` });
  }
  const noCost = stock.filter((s) => s.unitCost <= 0);
  if (noCost.length) checks.push({ ok: false, title: 'Articles en stock sans prix d’achat',
    detail: `${noCost.map((s) => s.code).join(', ')} : leur valeur n’est pas comptée dans le stock.` });
  const noPrice = stock.filter((s) => s.price <= 0);
  if (noPrice.length) checks.push({ ok: false, title: 'Articles en stock sans prix de vente', detail: noPrice.map((s) => s.code).join(', ') });
  const losses = saleLines.filter((l) => l.margin < -0.0005);
  if (losses.length) checks.push({ ok: false, title: 'Ventes à perte',
    detail: losses.map((l) => `facture ${String(l.invoice).padStart(3, '0')}, ${l.code} : ${fr3(l.margin)} DT`).join(' ; ') });
  if (supplierDebt > spent + 0.0005) checks.push({ ok: false, title: 'Dettes fournisseurs supérieures aux achats',
    detail: `${fr3(supplierDebt)} DT sont dus aux fournisseurs pour ${fr3(spent)} DT d’achats en stock : des marchandises ont sans doute été facturées sans être entrées en stock.` });
  if (src.agreedPrices > 0) checks.push({ ok: false, title: 'Prix négociés enregistrés comme prix permanents',
    detail: `${src.agreedPrices} prix sont fixés sur des fiches clients et s’appliqueront à chacun de leurs prochains achats.` });

  return {
    generatedAt: src.generatedAt,
    period: { from: movements.length ? day(movements[0].createdAt) : today, to: today, firstSale: saleLines.length ? firstSale : null },
    totals: {
      investment: src.investment, spent, unitsBought, revenue, cogs, margin, listValue, discounts: r3(listValue - revenue),
      stamps, invoiced, invoices: sales.length, unitsSold, recordedIn, expectedIn, receivable, flaggedAmount,
      stockCost, stockPrice, unitsOnHand, cashEstimate, position, charges, supplierDebt, paidToSuppliers,
      // What is owned, less what is owed — to the State and to suppliers.
      netValue: r3(position - stamps - supplierDebt),
      gain: r3(position - stamps - supplierDebt - src.investment), identityGap,
    },
    families, purchases, saleLines, timeline, paymentRows, owing, credits, stock, reconciliation, checks,
    chargeRows, chargesByCategory, debts,
    excluded: [...cancelled, ...pending].sort((a, b) => a.orderNumber - b.orderNumber).map((o) => ({
      order: Number(o.orderNumber), date: o.createdAt, client: o.clientName ?? '', total: Number(o.total || 0), status: o.status,
      invoice: o.invoiceNumber ? Number(o.invoiceNumber) : null, creditNote: o.creditNoteNumber ? Number(o.creditNoteNumber) : null,
      items: (o.items ?? []).map((it: Row) => `${Number(it.quantity)} × ${products.get(it.code)?.name?.fr ?? it.code}`).join(', '),
    })),
    movements: movements.map((m) => ({ date: m.createdAt, type: m.type, code: m.productCode, qty: Number(m.availableDelta),
      order: m.orderNumber ? Number(m.orderNumber) : null, by: m.performedByName ?? '', reason: m.reason ?? '' })),
  };
}

export type InvestorReport = ReturnType<typeof computeInvestorReport>;
