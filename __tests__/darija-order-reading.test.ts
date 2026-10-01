/**
 * The reading of a spoken order is a proposal, and these are the rules that
 * keep a proposal from becoming a wrong order.
 *
 * The model is asked for catalogue codes, not ids, and everything it hands
 * back is checked against real stock before it reaches a form. What is tested
 * here is that checking — not the model, which is not called.
 */
import { InterpretOrderUseCase } from '@/functions/orders/interpret/useCase';
import type { DarijaReading } from '@libs/darija-order';

jest.mock('@libs/darija-order', () => ({ readOrderFromDarija: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readOrderFromDarija } = require('@libs/darija-order');

const PRODUCTS = [
  {
    sk: 'PRODUCT#aaaaaaaa-0000-0000-0000-000000000001',
    code: 'CGDT20',
    name: { fr: 'Clôture grillage double torsion', ar: 'شبكة' },
    priceTTC: 90,
    stockAvailable: 4,
  },
  {
    sk: 'PRODUCT#aaaaaaaa-0000-0000-0000-000000000002',
    code: 'FG27',
    name: { fr: 'Fil galvanisé', ar: 'سلك' },
    priceTTC: 4.8,
    stockAvailable: 500,
  },
];

const reading = (over: Partial<DarijaReading>): DarijaReading => ({
  reply: '',
  clientSpoken: null,
  clientSpokenLatin: null,
  clientPhone: null,
  clientCin: null,
  items: [],
  unknownItems: [],
  transporterSpoken: null,
  transporterSpokenLatin: null,
  transporterPhone: null,
  transporterPlate: null,
  transporterCin: null,
  transportCost: null,
  address: null,
  stops: [],
  notes: null,
  documentDate: null,
  warnings: [],
  question: null,
  ...over,
});

function useCase() {
  const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
  const clients = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
  const transporters = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
  return {
    uc: new InterpretOrderUseCase(products as any, clients as any, transporters as any),
    products,
    clients,
    transporters,
  };
}

describe('reading an order out of Derja', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses a code the model invented instead of ordering something', async () => {
    // The one failure that would be silent and expensive: a plausible-looking
    // code that is not in the catalogue turning into a real order line.
    readOrderFromDarija.mockResolvedValue(
      reading({ items: [{ code: 'CGDT99', quantity: 3, spoken: 'شبكة', price: null }] })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'ثلاثة شبكة' });

    expect(out.data!.items).toHaveLength(0);
    expect(out.data!.unknownItems).toContain('شبكة');
  });

  it('keeps a real code, and reports it against what is on the shelf', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ items: [{ code: 'CGDT20', quantity: 10, spoken: '3achra chabka', price: null }] })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: '3achra chabka' });

    expect(out.data!.items).toEqual([
      expect.objectContaining({
        productId: 'aaaaaaaa-0000-0000-0000-000000000001',
        code: 'CGDT20',
        quantity: 10,
        // Four on the shelf against ten asked for: shown, not silently capped
        // and not refused. The counter decides.
        stockAvailable: 4,
        short: true,
      }),
    ]);
  });

  it('searches for the names rather than deciding who was meant', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'فتحي الصالحي', transporterSpoken: 'منعم' })
    );

    const { uc, clients, transporters } = useCase();
    await uc.execute({ text: 'لفتحي الصالحي مع الشوفور منعم' });

    expect(clients.listAll).toHaveBeenCalledWith(undefined, 8, 'فتحي الصالحي');
    expect(transporters.listAll).toHaveBeenCalledWith(undefined, 8, 'منعم');
  });

  it('falls back to the Latin spelling, because the client list is Latin', async () => {
    // 199 of the 200 clients on the books are written in Latin letters, so a
    // name heard in Arabic finds nobody under the spelling it was said in.
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'خالد', clientSpokenLatin: 'Khaled' })
    );

    const { uc, clients } = useCase();
    await uc.execute({ text: 'لخالد' });

    expect(clients.listAll).toHaveBeenNthCalledWith(1, undefined, 8, 'خالد');
    expect(clients.listAll).toHaveBeenNthCalledWith(2, undefined, 8, 'Khaled');
  });

  it('stops at the first spelling when it found exactly one person', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'Khaled Barkaoui', clientSpokenLatin: 'Khaled Barkaoui' })
    );

    const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
    const one = { sk: 'CLIENT#c1', fullName: 'Khaled Barkaoui', phone: '+21611111111' };
    const clients = { listAll: jest.fn().mockResolvedValue({ items: [one] }) };
    const transporters = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
    const uc = new InterpretOrderUseCase(products as any, clients as any, transporters as any);

    const out = await uc.execute({ text: 'Khaled Barkaoui' });

    expect(clients.listAll).toHaveBeenCalledTimes(1);
    expect(out.data!.client.matches).toHaveLength(1);
  });

  it('identifies by the number before the name, and stops there', async () => {
    // Fifteen clients answer to "Mohamed"; none of them share a phone. The
    // number settles in one query what the name would only narrow.
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'Mohamed', clientPhone: '+21620123456' })
    );

    const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
    const one = { sk: 'CLIENT#c9', fullName: 'Mohamed Guesmi', phone: '+21620123456' };
    const clients = { listAll: jest.fn().mockResolvedValue({ items: [one] }) };
    const transporters = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
    const uc = new InterpretOrderUseCase(products as any, clients as any, transporters as any);

    const out = await uc.execute({ text: 'Mohamed +21620123456' });

    expect(clients.listAll).toHaveBeenCalledTimes(1);
    expect(clients.listAll).toHaveBeenCalledWith(undefined, 8, '+21620123456');
    expect(out.data!.client.matches[0].label).toBe('Mohamed Guesmi');
    expect(out.data!.client.isNew).toBe(false);
  });

  it('says plainly when the buyer is not on the books, and keeps his details', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({
        clientSpoken: 'Mokhtar Khlifi',
        clientPhone: '+21620123456',
        clientCin: '12345678',
        address: 'Zaghouan',
      })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'Mokhtar Khlifi ...' });

    expect(out.data!.client.isNew).toBe(true);
    // What the shop would otherwise have to type again to add him.
    expect(out.data!.client.phone).toBe('+21620123456');
    expect(out.data!.client.cin).toBe('12345678');
    expect(out.data!.address).toBe('Zaghouan');
  });

  it('finds the driver by his lorry plate', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ transporterSpoken: 'ALI', transporterPlate: '123 TN 4567' })
    );

    const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
    const clients = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
    const driver = { sk: 'TRANSPORTER#t1', name: 'Ali Barhoumi', vehiclePlateNumber: '123 TN 4567' };
    const transporters = { listAll: jest.fn().mockResolvedValue({ items: [driver] }) };
    const uc = new InterpretOrderUseCase(products as any, clients as any, transporters as any);

    const out = await uc.execute({ text: 'Chauffeur: ALI 123 TN 4567' });

    expect(transporters.listAll).toHaveBeenCalledWith(undefined, 8, '123 TN 4567');
    expect(out.data!.transporter.matches[0].label).toBe('Ali Barhoumi');
  });

  it('does not call anybody new when no name was said', async () => {
    readOrderFromDarija.mockResolvedValue(reading({}));

    const { uc, clients, transporters } = useCase();
    const out = await uc.execute({ text: 'زوز شبكة' });

    expect(clients.listAll).not.toHaveBeenCalled();
    expect(transporters.listAll).not.toHaveBeenCalled();
    // Nothing named means nothing missing — not a new client to invent.
    expect(out.data!.client.isNew).toBe(false);
  });

  it('carries the model’s own doubts through to the screen', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({
        items: [{ code: 'FG27', quantity: 1, spoken: 'fil', price: null }],
        warnings: ['Aucune quantité annoncée pour le fil — 1 supposé.'],
      })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'fil galvanisé' });

    expect(out.data!.warnings).toHaveLength(1);
  });
});

/**
 * OpenAI's strict mode is stricter than Anthropic's about the same schema, so
 * whichever vendor is switched on, the schema has to satisfy the stricter of
 * the two. Both rules below fail at runtime with a 400 and nowhere else, which
 * is a poor place to find out.
 */
describe('the reading schema stays strict-mode legal', () => {
  // The module is mocked above for the use-case tests, so the real schema has
  // to be reached past the mock. Importing it normally yields undefined, and a
  // walk over undefined passes without checking anything.
  const SCHEMA = jest.requireActual('@libs/darija-order').SCHEMA;

  function walk(node: any, path = 'root') {
    if (node?.type === 'object') {
      expect([path, node.additionalProperties]).toEqual([path, false]);
      const declared = Object.keys(node.properties ?? {}).sort();
      const required = [...(node.required ?? [])].sort();
      // Every property required — optionality is expressed as a null union.
      expect([path, required]).toEqual([path, declared]);
      for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, `${path}.${k}`);
    }
    if (node?.type === 'array') walk(node.items, `${path}[]`);
  }

  it('closes every object and requires every property', () => {
    walk(SCHEMA);
  });
});

/**
 * Free providers mostly lack strict schema mode. Plain JSON mode promises JSON
 * and nothing about its shape, so a reading arrives with keys missing — and a
 * missing key must read as "nothing was said", not crash an order.
 */
describe('a reading from a provider without strict mode', () => {
  const { normaliseReading } = jest.requireActual('@libs/darija-order');

  it('treats an absent field as nothing said', () => {
    const out = normaliseReading({ clientSpoken: 'Khaled', items: [{ code: 'CGDT20', quantity: 2 }] });

    expect(out.clientPhone).toBeNull();
    expect(out.warnings).toEqual([]);
    expect(out.unknownItems).toEqual([]);
    expect(out.transporterSpoken).toBeNull();
  });

  it('drops a line with no code rather than ordering it', () => {
    const out = normaliseReading({ items: [{ quantity: 5 }, { code: 'FG27', quantity: 3 }] });

    expect(out.items).toHaveLength(1);
    expect(out.items[0].code).toBe('FG27');
  });

  it('survives a completely empty answer', () => {
    expect(() => normaliseReading({})).not.toThrow();
    expect(normaliseReading({}).items).toEqual([]);
  });
});

describe('a price haggled out loud, and a round with several drops', () => {
  beforeEach(() => jest.clearAllMocks());

  it('carries the agreed price beside the catalogue one', async () => {
    // 90 on the shelf, 85 agreed at the counter. Both are shown: the shop is
    // proposing to change what this client pays, not silently doing it.
    readOrderFromDarija.mockResolvedValue(
      reading({ items: [{ code: 'CGDT20', quantity: 5, spoken: 'chabka b 85', price: 85 }] })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: '5 chabka b 85' });

    expect(out.data!.items[0]).toEqual(
      expect.objectContaining({ agreedPrice: 85, priceTTC: 90, quantity: 5 })
    );
  });

  it('ignores a price of zero rather than selling for nothing', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ items: [{ code: 'CGDT20', quantity: 1, spoken: 'chabka', price: 0 }] })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'chabka' });

    expect(out.data!.items[0].agreedPrice).toBeNull();
  });

  it('resolves each drop to real products', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({
        stops: [
          { label: null, address: 'Thala', items: [{ code: 'CGDT20', quantity: 2 }] },
          { label: null, address: 'Foussana', items: [{ code: 'FG27', quantity: 3 }] },
        ],
      })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'زوز لثالة وثلاثة لفوسانة' });

    expect(out.data!.stops).toHaveLength(2);
    expect(out.data!.stops[0].items[0].productId).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(out.data!.stops[1].address).toBe('Foussana');
  });

  it('drops a stop whose articles are all unknown', async () => {
    // Otherwise a misheard word becomes an empty delivery the lorry drives to.
    readOrderFromDarija.mockResolvedValue(
      reading({ stops: [{ label: null, address: 'Thala', items: [{ code: 'NOPE', quantity: 2 }] }] })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'لثالة' });

    expect(out.data!.stops).toEqual([]);
  });
});

describe('answering back', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the earlier turns through, so "two more" means something', async () => {
    readOrderFromDarija.mockResolvedValue(reading({ reply: 'زدت زوز أخرى' }));

    const { uc } = useCase();
    const history = [
      { role: 'user' as const, text: 'زوز شبكة لخالد' },
      { role: 'assistant' as const, text: 'زوز شبكة 20 لخالد برقاوي' },
    ];
    await uc.execute({ text: 'زيد زوز أخرى', history });

    expect(readOrderFromDarija).toHaveBeenCalledWith(
      'زيد زوز أخرى',
      expect.any(Array),
      expect.any(String),
      history,
      null
    );
  });

  it('tells the model what is on the shelf, so it can say what is short', async () => {
    readOrderFromDarija.mockResolvedValue(reading({}));

    const { uc } = useCase();
    await uc.execute({ text: 'chabka' });

    const catalogue = readOrderFromDarija.mock.calls[0][1];
    expect(catalogue).toEqual([
      expect.objectContaining({ code: 'CGDT20', stock: 4 }),
      expect.objectContaining({ code: 'FG27', stock: 500 }),
    ]);
  });

  it('carries the spoken answer out to the screen', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ reply: 'ما عندناش كان أربعة شبكة، نعملهم؟' })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: '3achra chabka' });

    expect(out.data!.reply).toBe('ما عندناش كان أربعة شبكة، نعملهم؟');
  });

  it('never sends a history that was not given', async () => {
    readOrderFromDarija.mockResolvedValue(reading({}));

    const { uc } = useCase();
    await uc.execute({ text: 'chabka' });

    expect(readOrderFromDarija.mock.calls[0][3]).toEqual([]);
  });
});

/**
 * The cards are the interactive half: what the screen offers and the shop taps.
 * Every one but the question is composed here from what the server knows, so
 * that a model which was never told a fact cannot invent one into a card.
 */
describe('what the screen is offered', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the choice when several people answer to the name', async () => {
    readOrderFromDarija.mockResolvedValue(reading({ clientSpoken: 'Mohamed' }));

    const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
    const many = [
      { sk: 'CLIENT#a', fullName: 'Mohamed Guesmi', phone: '+2161' },
      { sk: 'CLIENT#b', fullName: 'Mohamed Rtibi', phone: '+2162' },
    ];
    const clients = { listAll: jest.fn().mockResolvedValue({ items: many }) };
    const transporters = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
    const uc = new InterpretOrderUseCase(products as any, clients as any, transporters as any);

    const out = await uc.execute({ text: 'Mohamed' });
    const card = out.data!.cards.find((c) => c.type === 'client_choice');

    expect(card).toBeDefined();
    expect((card as any).options).toHaveLength(2);
    // Never both: a name either matched people or it did not.
    expect(out.data!.cards.some((c) => c.type === 'client_new')).toBe(false);
  });

  it('offers to add him when nobody answers, carrying what was written down', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'Mokhtar Khlifi', clientPhone: '+21620123456' })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'Mokhtar Khlifi' });
    const card = out.data!.cards.find((c) => c.type === 'client_new') as any;

    expect(card.name).toBe('Mokhtar Khlifi');
    expect(card.phone).toBe('+21620123456');
  });

  it('raises the shelf only for the lines that are actually short', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({
        items: [
          { code: 'CGDT20', quantity: 10, spoken: 'chabka', price: null },
          { code: 'FG27', quantity: 3, spoken: 'fil', price: null },
        ],
      })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: '...' });
    const card = out.data!.cards.find((c) => c.type === 'stock') as any;

    expect(card.lines).toEqual([{ code: 'CGDT20', asked: 10, onShelf: 4 }]);
  });

  it('passes the model’s question through with its ready answers', async () => {
    readOrderFromDarija.mockResolvedValue(
      reading({ question: { text: 'بالشوفور ولا بلاش؟', options: ['بالشوفور', 'بلاش'] } })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'chabka' });
    const card = out.data!.cards.find((c) => c.type === 'question') as any;

    expect(card.options).toEqual(['بالشوفور', 'بلاش']);
  });

  it('offers nothing at all when there is nothing to settle', async () => {
    readOrderFromDarija.mockResolvedValue(reading({}));

    const { uc } = useCase();
    const out = await uc.execute({ text: 'salut' });

    expect(out.data!.cards).toEqual([]);
  });
});

describe('where the order stands', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the screen’s own state, not the model’s memory of it', async () => {
    // The shop corrects quantities and picks addresses between turns and none
    // of that reaches the model any other way. Without it every answer after
    // the first is composed blind.
    readOrderFromDarija.mockResolvedValue(reading({}));

    const state = {
      client: 'Mohamed Guesmi',
      items: [{ code: 'CGDT20', quantity: 4 }],
      address: null,
      driver: null,
    };

    const { uc } = useCase();
    await uc.execute({ text: 'زيد واحد', state });

    expect(readOrderFromDarija.mock.calls[0][4]).toEqual(state);
  });
});

describe('a name that came through a microphone', () => {
  beforeEach(() => jest.clearAllMocks());

  it('finds the man when only the surname was misspelled', async () => {
    // What actually happened: "الفتحي صالحي" was transliterated "Fathi Saleh",
    // and FATHI SALHI — plainly on the books — came back as a stranger,
    // because the search wants every word present.
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'الفتحي صالح', clientSpokenLatin: 'Fathi Saleh' })
    );

    const products = { listAll: jest.fn().mockResolvedValue({ items: PRODUCTS }) };
    const him = { sk: 'CLIENT#f1', fullName: 'FATHI SALHI', phone: '+21620000000' };
    const clients = {
      listAll: jest.fn(async (_c: unknown, _l: unknown, q: string) =>
        // The whole name matches nobody; the first name alone matches him.
        ({ items: q === 'Fathi' ? [him] : [] })
      ),
    };
    const transporters = { listAll: jest.fn().mockResolvedValue({ items: [] }) };
    const uc = new InterpretOrderUseCase(products as any, clients as any, transporters as any);

    const out = await uc.execute({ text: 'فاتورة للفتحي صالحي' });

    expect(out.data!.client.isNew).toBe(false);
    expect(out.data!.client.matches[0].label).toBe('FATHI SALHI');
  });

  it('still reports a genuine stranger as new', async () => {
    // The fallback must not turn every unknown name into somebody.
    readOrderFromDarija.mockResolvedValue(
      reading({ clientSpoken: 'Mokhtar Khlifi', clientSpokenLatin: 'Mokhtar Khlifi' })
    );

    const { uc } = useCase();
    const out = await uc.execute({ text: 'Mokhtar Khlifi' });

    expect(out.data!.client.isNew).toBe(true);
  });
});
