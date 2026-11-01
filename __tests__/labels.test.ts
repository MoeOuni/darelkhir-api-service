import {
  ticketPrice,
  formatTicketPrice,
  pagesFor,
  rtlVisualOrder,
  renderLabelsPdf,
  TICKETS_PER_PAGE,
} from '@libs/labels';
import { ProductLabelsSchema, MAX_TICKETS } from '@/schemas/labels.schema';
import { ProductLabelsUseCase } from '@/functions/products/labels/useCase';

jest.mock('@libs/s3-invoice', () => ({
  uploadPdfToS3: jest.fn(async (_pdf: Buffer, key: string) => key),
  getDocumentDownloadUrl: jest.fn(async (key: string) => `https://signed.example/${key}`),
}));

/** Pages in a rendered PDF, counted the way a viewer would. */
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

const fridge = {
  code: 'CRS81NDX',
  name: { fr: 'Réfrigérateur Side by Side Condor 640 L', ar: 'ثلاجة كوندور سايد باي سايد 640 لتر' },
  priceTTC: 3490,
};

describe('the price a ticket shows', () => {
  it('is the catalogue price, tax included', () => {
    expect(ticketPrice(fridge)).toEqual({ price: 3490 });
  });

  it('shows a real reduction as the price, with the old one beside it', () => {
    expect(ticketPrice({ ...fridge, discountedPrice: 3190 })).toEqual({ price: 3190, was: 3490, percent: 9 });
  });

  it('uses the percentage the shop typed when there is one', () => {
    expect(ticketPrice({ ...fridge, discountedPrice: 3190, discountPercentage: 10 })?.percent).toBe(10);
  });

  /**
   * A "reduction" that charges the same or more is a setting mistake, and the
   * shop floor is the worst place to advertise it as a promotion.
   */
  it('ignores a reduction that is not lower than the catalogue price', () => {
    expect(ticketPrice({ ...fridge, discountedPrice: 3490 })).toEqual({ price: 3490 });
    expect(ticketPrice({ ...fridge, discountedPrice: 3600 })).toEqual({ price: 3490 });
  });

  /** A ticket reading 0.000 on a fridge is worse than no ticket at all. */
  it('has nothing to print for a product nobody has priced', () => {
    expect(ticketPrice({ ...fridge, priceTTC: 0 })).toBeNull();
    expect(ticketPrice({ ...fridge, priceTTC: undefined })).toBeNull();
  });

  it('prints the figures the invoice prints', () => {
    expect(formatTicketPrice(3490)).toBe('3 490.000');
    expect(formatTicketPrice(479.5)).toBe('479.500');
  });
});

describe('the sheet', () => {
  it('holds eight tickets', () => {
    expect(TICKETS_PER_PAGE).toBe(8);
    expect(pagesFor(8)).toBe(1);
    expect(pagesFor(9)).toBe(2);
  });

  it('renders one page per eight tickets, each product as many times as asked', async () => {
    const { pdf, tickets, pages } = await renderLabelsPdf([
      { product: fridge, copies: 5 },
      { product: { ...fridge, code: 'CRF-T5GM8', priceTTC: 479.5 }, copies: 4 },
    ]);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(tickets).toBe(9);
    expect(pages).toBe(2);
    expect(pageCount(pdf)).toBe(2);
  });

  it('refuses to draw a product with no price, as the last line of defence', async () => {
    await expect(renderLabelsPdf([{ product: { ...fridge, priceTTC: 0 }, copies: 1 }])).rejects.toThrow(
      'no selling price',
    );
  });
});

/**
 * An Arabic name runs right to left as a whole; only numbers and Latin words
 * keep their own order inside it. The first version reused the invoice's
 * reordering — built for a French line with some Arabic in it — and printed
 * "دورة سوداء 1000 كغ 7 غسالة" for "غسالة … 7 كغ 1000 دورة سوداء".
 */
describe('an Arabic name with numbers in it', () => {
  const w = (type: 'ar' | 'en', text: string) => ({ type, text });

  it('is drawn in reverse, with each number left intact', () => {
    const logical = [w('ar', 'غسالة'), w('en', '7'), w('ar', 'كغ'), w('en', '1000'), w('ar', 'دورة')];
    expect(rtlVisualOrder(logical).map((x) => x.text)).toEqual(['دورة', '1000', 'كغ', '7', 'غسالة']);
  });

  it('keeps a run of Latin words in its own order', () => {
    const logical = [w('ar', 'ثلاجة'), w('en', 'No'), w('en', 'Frost'), w('ar', 'بيضاء')];
    expect(rtlVisualOrder(logical).map((x) => x.text)).toEqual(['بيضاء', 'No', 'Frost', 'ثلاجة']);
  });
});

describe('what may be asked for', () => {
  const id = '6f1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15';

  it('needs at least one ticket of each product asked for', () => {
    expect(ProductLabelsSchema.safeParse({ items: [{ productId: id, copies: 0 }] }).success).toBe(false);
  });

  it(`stops at ${MAX_TICKETS} tickets in one go`, () => {
    const items = Array.from({ length: 5 }, () => ({ productId: id, copies: 200 }));
    expect(ProductLabelsSchema.safeParse({ items }).success).toBe(false);
  });
});

describe('printing from the catalogue', () => {
  const product = (over: Record<string, any> = {}) => ({
    code: 'CON-F710LB',
    name: { fr: 'Machine à laver Condor 7 kg', ar: 'غسالة ملابس كوندور 7 كغ' },
    priceTTC: 1199,
    purchasePrice: 783.1,
    ...over,
  });

  it('refuses products with no selling price, and names them', async () => {
    const repo = {
      findByUuid: async (id: string) => (id === 'a' ? product() : product({ code: 'CRS81NDX', priceTTC: 0 })),
    } as any;

    await expect(
      new ProductLabelsUseCase(repo).execute({
        items: [
          { productId: 'a', copies: 1 },
          { productId: 'b', copies: 1 },
        ],
      }),
    ).rejects.toThrow('CRS81NDX');
  });

  it('refuses a product that does not exist', async () => {
    const repo = { findByUuid: async () => null } as any;
    await expect(
      new ProductLabelsUseCase(repo).execute({ items: [{ productId: 'gone', copies: 1 }] }),
    ).rejects.toThrow('introuvable');
  });

  it('counts a product picked twice as one, with both counts', async () => {
    const repo = { findByUuid: async () => product() } as any;
    const result = await new ProductLabelsUseCase(repo).execute({
      items: [
        { productId: 'a', copies: 3 },
        { productId: 'a', copies: 2 },
      ],
    });
    expect(result.tickets).toBe(5);
    expect(result.pages).toBe(1);
    expect(result.url).toMatch(/^https:\/\/signed\.example\/labels\/etiquettes-.*\.pdf$/);
  });
});
