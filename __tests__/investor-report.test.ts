import { computeInvestorReport, type ReportSource } from '@libs/investor-report/compute';
import { renderInvestorReportPdf } from '@libs/investor-report/pdf';
import { renderInvestorReportEmail } from '@libs/investor-report/email';
import { tunisNow } from '@libs/investor-report/load';
import { UpdateSettingsSchema } from '@/schemas/settings.schema';

/**
 * A shop small enough to work out by hand.
 *
 * Bought: 3 TVs at 600 and 10 kits at 10 (1 900). Sold: 2 TVs at 800, one of
 * them at a counter discount of 50, plus 1 kit — on invoices 001 and 003.
 * Invoice 002 was cancelled by a credit note and its TV came back. A third
 * order is pending with 2 kits set aside. Payments: the first invoice is paid
 * twice by mistake, the cancelled order's payment was never reversed, and the
 * last client still owes 200.
 */
const iso = (d: string) => `2026-10-${d}T10:00:00.000Z`;
const source = (over: Partial<ReportSource> = {}): ReportSource => ({
  generatedAt: '2026-10-31T18:00:00',
  investment: 2000,
  categories: [{ sk: 'CATEGORY#tv', name: { fr: 'Téléviseur' } }, { sk: 'CATEGORY#pe', name: { fr: 'Petit électro' } }],
  products: [
    { code: 'TV43', name: { fr: 'TV 43"' }, categoryId: 'tv', purchasePrice: 600, priceTTC: 800, stockAvailable: 1 },
    { code: 'KIT', name: { fr: 'Kit Bluetooth' }, categoryId: 'pe', purchasePrice: 10, priceTTC: 25, stockAvailable: 7 },
  ],
  movements: [
    { createdAt: iso('03'), type: 'initial', productCode: 'TV43', availableDelta: 3 },
    { createdAt: iso('03'), type: 'adjustment', productCode: 'KIT', availableDelta: 10 },
    { createdAt: iso('12'), type: 'sale', productCode: 'TV43', availableDelta: -1, orderNumber: 1 },
    { createdAt: iso('13'), type: 'sale', productCode: 'TV43', availableDelta: -1, orderNumber: 2 },
    { createdAt: iso('14'), type: 'return', productCode: 'TV43', availableDelta: 1, orderNumber: 2 },
    { createdAt: iso('20'), type: 'sale', productCode: 'TV43', availableDelta: -1, orderNumber: 3 },
    { createdAt: iso('20'), type: 'sale', productCode: 'KIT', availableDelta: -1, orderNumber: 3 },
    { createdAt: iso('21'), type: 'sale', productCode: 'KIT', availableDelta: -2, orderNumber: 4 },
  ],
  orders: [
    { sk: 'ORDER#o1', orderNumber: 1, status: 'delivered', invoiceNumber: 1, invoiceIssuedAt: iso('12'), createdAt: iso('12'), clientName: 'Sami', timber: 1, total: 801,
      items: [{ code: 'TV43', quantity: 1, priceTTC: 800 }] },
    { sk: 'ORDER#o2', orderNumber: 2, status: 'cancelled', invoiceNumber: 2, creditNoteNumber: 1, createdAt: iso('13'), clientName: 'Hédi', timber: 1, total: 801,
      items: [{ code: 'TV43', quantity: 1, priceTTC: 800 }] },
    { sk: 'ORDER#o3', orderNumber: 3, status: 'confirmed', invoiceNumber: 3, invoiceIssuedAt: iso('20'), createdAt: iso('20'), clientName: 'Nadia', timber: 1, total: 776,
      items: [{ code: 'TV43', quantity: 1, priceTTC: 800, discountedPrice: 750 }, { code: 'KIT', quantity: 1, priceTTC: 25 }] },
    { sk: 'ORDER#o4', orderNumber: 4, status: 'pending', createdAt: iso('21'), clientName: 'Ali', timber: 1, total: 51,
      items: [{ code: 'KIT', quantity: 2, priceTTC: 25 }] },
  ],
  payments: [
    { orderId: 'o1', clientId: 'c1', amount: 801, method: 'cash', paidAt: iso('12') },
    { orderId: 'o1', clientId: 'c1', amount: 801, method: 'cash', paidAt: iso('12') },
    { orderId: 'o2', clientId: 'c2', amount: 801, method: 'cash', paidAt: iso('13') },
    { orderId: 'o3', clientId: 'c3', amount: 576, method: 'cash', paidAt: iso('20') },
  ],
  clients: [
    { sk: 'CLIENT#c1', fullName: 'Sami', balance: -801 },
    { sk: 'CLIENT#c2', fullName: 'Hédi', balance: -801 },
    { sk: 'CLIENT#c3', fullName: 'Nadia', balance: 200 },
  ],
  agreedPrices: 1,
  ...over,
});

describe('the figures', () => {
  const rep = computeInvestorReport(source());
  const t = rep.totals;

  it('counts what was bought at the purchase price', () => {
    expect(t.spent).toBe(1900);
    expect(t.unitsBought).toBe(13);
  });

  it('counts only invoiced sales, never the cancelled or the pending order', () => {
    expect(t.invoices).toBe(2);
    expect(t.revenue).toBe(800 + 750 + 25);
    expect(t.cogs).toBe(600 + 600 + 10);
    expect(t.margin).toBe(365);
    expect(t.discounts).toBe(50);
    expect(t.stamps).toBe(2);
  });

  /**
   * The identity the whole report rests on: what came in equals what was
   * sold plus what is left, at cost. The pending order's kits are set aside,
   * not sold, so they are still stock.
   */
  it('finds every dinar spent either in what was sold or in what is left', () => {
    expect(t.unitsOnHand).toBe(1 + 7 + 2);
    expect(t.stockCost).toBe(600 + 90);
    expect(t.spent).toBe(t.cogs + t.stockCost);
    expect(t.identityGap).toBe(0);
  });

  /**
   * The cash that should be there comes from the invoices, not from the
   * payment records — which, here, count one payment twice and keep one for
   * a cancelled order.
   */
  it('takes the cash from the invoices, not from payment records that are wrong', () => {
    expect(t.invoiced).toBe(801 + 776);
    expect(t.receivable).toBe(200);
    expect(t.expectedIn).toBe(1377);
    expect(t.recordedIn).toBe(2979);
    expect(t.flaggedAmount).toBe(801 + 801);
    expect(t.cashEstimate).toBe(2000 - 1900 + 1377);
  });

  it('says where the investment is now, and that it grew by the margin', () => {
    expect(t.position).toBe(t.stockCost + t.cashEstimate + t.receivable);
    expect(t.gain).toBe(365);
  });

  it('flags the duplicate payment and the unreversed one, once each', () => {
    const titles = rep.checks.filter((c) => !c.ok).map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(['Doublon, commande #1', 'Paiement d’une commande annulée, commande #2']));
    // Their clients' credits are the same two problems, so they are not listed again.
    expect(titles.some((x) => x.startsWith('Avoir client'))).toBe(false);
  });

  it('confirms the stock when every product reconciles', () => {
    expect(rep.checks[0]).toMatchObject({ ok: true, title: 'Le stock se recoupe' });
  });

  it('catches a product whose stock no longer matches its movements', () => {
    const broken = source();
    broken.products[0].stockAvailable = 4;
    expect(computeInvestorReport(broken).checks[0]).toMatchObject({ ok: false, title: 'Stock incohérent pour 1 article(s)' });
  });

  it('groups the sales week by week, Monday to Sunday', () => {
    expect(rep.timeline.map((w) => [w.label, w.revenue])).toEqual([
      ['12–18 oct.', 800],
      ['19–25 oct.', 775],
      ['26–31 oct.', 0],
    ]);
  });
});

describe('the paper', () => {
  it('renders a PDF with every page numbered', async () => {
    const pdf = await renderInvestorReportPdf(computeInvestorReport(source()), { businessName: 'Dar El Khir' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('renders even before the investment is filled in', async () => {
    const pdf = await renderInvestorReportPdf(computeInvestorReport(source({ investment: 0 })), { businessName: 'Dar El Khir' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('puts the headline figures in the email body, in the shop’s number format', () => {
    const mail = renderInvestorReportEmail(computeInvestorReport(source()), { businessName: 'Dar El Khir', requestedBy: 'Yahya', pages: 6 });
    expect(mail.subject).toBe('Rapport aux investisseurs Dar El Khir, situation au 31/10/2026');
    expect(mail.text).toContain('Ventes : 1 575,000 DT (2 factures)');
    expect(mail.text).toContain('demandée par Yahya');
    expect(mail.text).toContain('3 points à vérifier');
  });
});

describe('the time it is "as of"', () => {
  it('is Tunisian time, not the server’s UTC', () => {
    expect(tunisNow(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01T00:30:00');
  });
});

describe('who it goes to', () => {
  it('accepts a list of addresses and normalises them', () => {
    const parsed = UpdateSettingsSchema.parse({ reportRecipients: [' Moe.Ouni20@gmail.com '] });
    expect(parsed.reportRecipients).toEqual(['moe.ouni20@gmail.com']);
  });

  it('refuses something that is not an address, and an empty list', () => {
    expect(UpdateSettingsSchema.safeParse({ reportRecipients: ['not an email'] }).success).toBe(false);
    expect(UpdateSettingsSchema.safeParse({ reportRecipients: [] }).success).toBe(false);
  });
});

// ── The endpoint, in both of its roles ───────────────────────────────────
const send = jest.fn();
const sendEmail = jest.fn();
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: (...a: unknown[]) => send(...a) })),
  InvokeCommand: jest.fn((input) => ({ input })),
}));
jest.mock('@libs/email/sender', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock('@libs/settings', () => ({
  getSettings: jest.fn(async () => ({ businessName: 'DAR EL KHIR', investorCapital: 2000, reportRecipients: ['a@x.tn', 'b@x.tn'] })),
}));
jest.mock('@libs/investor-report/load', () => ({
  ...jest.requireActual('@libs/investor-report/load'),
  loadReportSource: jest.fn(async (investment: number, generatedAt: string) => ({ ...source(), investment, generatedAt })),
}));

describe('sending it', () => {
  beforeEach(() => { send.mockReset(); sendEmail.mockReset(); });

  it('builds the report and mails the PDF to every recipient, in one message', async () => {
    const { runInvestorReport } = await import('@/functions/reports/investor/endpoint');
    const result = await runInvestorReport({ job: 'investor-report', requestedBy: 'Yahya' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toEqual(['a@x.tn', 'b@x.tn']);
    expect(arg.attachments[0].filename).toMatch(/^Dar-El-Khir-rapport-investisseurs-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(arg.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
    expect(result.pages).toBeGreaterThanOrEqual(4);
  });

  /**
   * The dashboard's request must come back well inside the gateway's thirty
   * seconds, so it does no work beyond starting the background run.
   */
  it('answers the dashboard at once and leaves the work to a background run of itself', async () => {
    const { startInvestorReport } = await import('@/functions/reports/investor/endpoint');
    const res = await startInvestorReport({ user: { name: 'Yahya' } } as any, { functionName: 'darelkhir-api-service-dev-sendInvestorReport' } as any);

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).data.recipients).toEqual(['a@x.tn', 'b@x.tn']);
    expect(sendEmail).not.toHaveBeenCalled();
    const input = send.mock.calls[0][0].input;
    expect(input.FunctionName).toBe('darelkhir-api-service-dev-sendInvestorReport');
    expect(input.InvocationType).toBe('Event');
    expect(JSON.parse(Buffer.from(input.Payload).toString())).toEqual({ job: 'investor-report', requestedBy: 'Yahya' });
  });

  it('is told apart from a dashboard request by its payload alone', async () => {
    const { isJob } = await import('@/functions/reports/investor/endpoint');
    expect(isJob({ job: 'investor-report' })).toBe(true);
    expect(isJob({ requestContext: { http: { method: 'POST' } }, body: '{"job":"investor-report"}' })).toBe(false);
  });
});
