import { reverseArabicRuns, layoutMixedText, orderAddress, printedDate } from '@libs/invoice';

type Word = { type: 'ar' | 'en'; text: string };

/** One unit per character, so the expected wrapping is easy to reason about. */
const measure = (w: Word) => w.text.length;
const space = () => 1;

describe('reverseArabicRuns', () => {
  it('puts the first Arabic word at the right of its run', () => {
    const line: Word[] = [
      { type: 'ar', text: 'مسجد' },
      { type: 'ar', text: 'الرحمة' },
    ];
    // Drawn left to right, so the logically first word must come last.
    expect(reverseArabicRuns(line).map((w) => w.text)).toEqual(['الرحمة', 'مسجد']);
  });

  it('leaves Latin words where they are', () => {
    const line: Word[] = [
      { type: 'en', text: 'En' },
      { type: 'en', text: 'face' },
      { type: 'en', text: 'de' },
    ];
    expect(reverseArabicRuns(line).map((w) => w.text)).toEqual(['En', 'face', 'de']);
  });

  it('reverses only the Arabic run inside a Latin sentence', () => {
    const line: Word[] = [
      { type: 'en', text: 'face' },
      { type: 'ar', text: 'مسجد' },
      { type: 'ar', text: 'الرحمة' },
      { type: 'en', text: 'Foussana' },
    ];
    expect(reverseArabicRuns(line).map((w) => w.text)).toEqual([
      'face',
      'الرحمة',
      'مسجد',
      'Foussana',
    ]);
  });

  it('handles two separate Arabic runs independently', () => {
    const line: Word[] = [
      { type: 'ar', text: 'أ' },
      { type: 'ar', text: 'ب' },
      { type: 'en', text: 'X' },
      { type: 'ar', text: 'ج' },
      { type: 'ar', text: 'د' },
    ];
    expect(reverseArabicRuns(line).map((w) => w.text)).toEqual(['ب', 'أ', 'X', 'د', 'ج']);
  });
});

describe('layoutMixedText', () => {
  it('wraps between words, not only between scripts', () => {
    // The old renderer broke only at a change of script, so a long Latin
    // address ran past the edge of its box.
    const lines = layoutMixedText(measure, space, 'aaaa bbbb cccc dddd', 10);
    expect(lines.map((l) => l.map((w) => w.text).join(' '))).toEqual([
      'aaaa bbbb',
      'cccc dddd',
    ]);
  });

  it('keeps a word that is wider than the column rather than dropping it', () => {
    const lines = layoutMixedText(measure, space, 'aaaaaaaaaaaaaaa bb', 10);
    expect(lines[0][0].text).toBe('aaaaaaaaaaaaaaa');
    expect(lines).toHaveLength(2);
  });

  it('tags Arabic and Latin words separately in one address', () => {
    const lines = layoutMixedText(measure, space, 'En face de مسجد', 100);
    expect(lines).toHaveLength(1);
    expect(lines[0].map((w) => w.type)).toEqual(['en', 'en', 'en', 'ar']);
  });
});

describe('orderAddress', () => {
  it('drops parts the street already contains', () => {
    const address = orderAddress({
      shippingAddress: {
        street: 'Kasserine, Foussana, 1220, En face de',
        city: 'Foussana',
        state: 'Kasserine',
        postalCode: '1220',
        country: 'TN',
      },
    } as never);

    expect(address).toBe('Kasserine, Foussana, 1220, En face de, TN');
  });

  it('keeps parts that are genuinely new', () => {
    const address = orderAddress({
      shippingAddress: {
        street: 'Rue de la Liberté',
        city: 'Foussana',
        state: 'Kasserine',
        postalCode: '1220',
        country: 'TN',
      },
    } as never);

    expect(address).toBe('Rue de la Liberté, Foussana, Kasserine, 1220, TN');
  });
});

describe('printedDate', () => {
  const base = {
    invoiceIssuedAt: '2026-08-21T09:00:00.000Z',
    createdAt: '2026-08-20T18:00:00.000Z',
  };

  it('uses the day the invoice was issued', () => {
    expect(printedDate(base as never)).toBe('2026-08-21');
  });

  it('lets a chosen date win', () => {
    // Written the night before, handed over the next morning.
    expect(printedDate({ ...base, documentDate: '2026-08-20' } as never)).toBe('2026-08-20');
  });

  it('ignores a blank choice', () => {
    expect(printedDate({ ...base, documentDate: '   ' } as never)).toBe('2026-08-21');
  });

  it('falls back to when the order was taken', () => {
    expect(printedDate({ createdAt: base.createdAt } as never)).toBe('2026-08-20');
  });
});
