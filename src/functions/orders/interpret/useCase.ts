import { ProductRepository } from '@/repositories/ProductRepository';
import { ClientRepository } from '@/repositories/ClientRepository';
import { TransporterRepository } from '@/repositories/TransporterRepository';
import {
  readOrderFromDarija,
  type CatalogueLine,
  type DraftState,
  type Turn,
} from '@libs/darija-order';

/**
 * Turns a sentence into a filled-in order form, and stops there.
 *
 * Nothing is written. The answer is a proposal the counter hand looks at in
 * the normal new-order screen, where the quantities can be corrected and the
 * right Fathi picked out of the three of them before anything moves. An order
 * takes stock off the shelf, changes what a client owes and burns an invoice
 * number that cannot come back, so a machine reading of a spoken sentence is
 * not enough on its own.
 */

interface Candidate {
  id: string;
  label: string;
  detail?: string;
}

interface DraftItem {
  productId: string;
  code: string;
  name: { fr: string; ar: string };
  quantity: number;
  /** The words this line came from, so a misreading is visible. */
  spoken: string;
  stockAvailable: number;
  /** The catalogue price, for comparison. */
  priceTTC: number;
  /**
   * The price agreed out loud, per unit, tax included.
   *
   * An order line carries no price of its own — the only place a price for one
   * client can live is his agreed prices, which the order then applies. So this
   * is a proposal for that, not something already in force.
   */
  agreedPrice: number | null;
  /** True when the shelf cannot cover the quantity asked for. */
  short: boolean;
}

/**
 * A thing the screen shows and the shop can act on.
 *
 * Composed here rather than asked of the model, because every one of these is
 * a fact the server holds and the model does not: which Mohamed matched, what
 * is actually on the shelf, whether the man is on the books at all. The one
 * exception is `question`, which is the model's, because only it knows what it
 * still needs to be told.
 */
export type Card =
  | { type: 'items'; lines: DraftItem[] }
  | { type: 'stock'; lines: { code: string; asked: number; onShelf: number }[] }
  | { type: 'client_choice'; options: Candidate[] }
  | { type: 'client_new'; name: string; phone: string | null; cin: string | null }
  | { type: 'driver_choice'; options: Candidate[] }
  | { type: 'driver_new'; name: string; phone: string | null; plate: string | null }
  | { type: 'unknown'; words: string[] }
  | { type: 'question'; text: string; options: string[] };

interface InterpretResult {
  success: boolean;
  message: string;
  data?: {
    /** What to say back, spoken aloud on the phone. */
    reply: string;
    /**
     * Who the note names, who that matched on the books, and what was written
     * down about them. When nothing matched, these details are what the shop
     * needs to add the person without typing them again.
     */
    client: {
      spoken: string | null;
      matches: Candidate[];
      phone: string | null;
      cin: string | null;
      /** True when a name was given and nobody on the books answers to it. */
      isNew: boolean;
    };
    transporter: {
      spoken: string | null;
      matches: Candidate[];
      phone: string | null;
      plate: string | null;
      cin: string | null;
      isNew: boolean;
    };
    items: DraftItem[];
    unknownItems: string[];
    transportCost: number | null;
    address: string | null;
    /** One lorry, several gates. Empty for the ordinary single-drop order. */
    stops: {
      label: string | null;
      address: string;
      items: { productId: string; code: string; quantity: number }[];
    }[];
    notes: string | null;
    documentDate: string | null;
    warnings: string[];
    /** In the order the shop should deal with them. */
    cards: Card[];
  };
}

export class InterpretOrderUseCase {
  constructor(
    private products: ProductRepository,
    private clients: ClientRepository,
    private transporters: TransporterRepository
  ) {}

  /**
   * Searches for a name under every spelling it might be written in, and
   * returns one list with no repeats.
   *
   * A name said in Arabic and a list written in Latin never meet on their own.
   * Trying both costs one extra query on the rare occasions the first spelling
   * already found the person.
   */
  private async lookUp(
    search: (q: string) => Promise<{ items: any[] }>,
    ...spellings: (string | null)[]
  ): Promise<any[]> {
    const found = new Map<string, any>();

    for (const spelling of spellings) {
      if (!spelling?.trim()) continue;
      const page = await search(spelling.trim());
      for (const item of page.items) found.set(item.sk as string, item);
      // One clean hit is enough; the other spelling would only repeat it.
      if (found.size === 1 && page.items.length === 1) break;
    }

    if (found.size > 0) return [...found.values()].slice(0, 8);

    // Nothing whole matched. The search wants every word present, and one
    // wrong letter in a surname is enough to lose a man who is plainly on the
    // books: "Fathi Saleh" finds nobody while "Fathi Salhi" finds him, and a
    // name that arrived through a microphone and a transliteration will differ
    // by a letter most of the time.
    //
    // So the longest words are tried alone. "fathi" finds FATHI SALHI, and the
    // shop picks him out of whoever else answers to it — which is the same
    // choice it already makes for the fifteen Mohameds.
    const words = [...new Set(spellings.filter(Boolean).flatMap((n) => n!.split(/\s+/)))]
      .filter((w) => w.length >= 3)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

    for (const word of words) {
      const page = await search(word);
      for (const item of page.items) found.set(item.sk as string, item);
      if (found.size > 0) break;
    }

    return [...found.values()].slice(0, 8);
  }

  async execute(input: {
    text: string;
    history?: Turn[];
    state?: DraftState;
  }): Promise<InterpretResult> {
    // The catalogue is small and changes rarely, so the whole of it goes to
    // the model. Matching a spoken word to a code is the one part of this the
    // model is better at than a search index — "chabka" is not a substring of
    // "Clôture grillage double torsion".
    const stock = await this.products.listAll(undefined, 100);
    const catalogue: CatalogueLine[] = stock.items.map((p) => ({
      code: p.code,
      fr: p.name.fr,
      ar: p.name.ar,
      // What is on the shelf, so the answer can say "there are only four"
      // instead of the shop finding out at the validation step.
      stock: p.stockAvailable,
      aliases: p.aliases,
    }));

    if (catalogue.length === 0) {
      return { success: false, message: 'No products to order' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const reading = await readOrderFromDarija(
      input.text,
      catalogue,
      today,
      input.history ?? [],
      input.state ?? null
    );

    // ── Names to records ──────────────────────────────────────────────────
    // Searched, not decided. Several people here share a first name, so the
    // screen offers what matched and the human picks.
    const byCode = new Map(stock.items.map((p) => [p.code, p]));

    const items: DraftItem[] = [];
    const unknown = [...reading.unknownItems];

    for (const line of reading.items) {
      const product = byCode.get(line.code);
      // A code the model invented is treated as something it misheard, not as
      // a product. Guarding here is what keeps a hallucinated code out of an
      // order.
      if (!product) {
        unknown.push(line.spoken);
        continue;
      }

      const quantity = Math.max(0, line.quantity);
      items.push({
        productId: (product.sk as string).split('#')[1],
        code: product.code,
        name: product.name,
        quantity,
        spoken: line.spoken,
        stockAvailable: product.stockAvailable,
        priceTTC: product.priceTTC,
        agreedPrice: typeof line.price === 'number' && line.price > 0 ? line.price : null,
        short: quantity > product.stockAvailable,
      });
    }

    // The number first, then the card, then the name in both spellings.
    // Fifteen clients here are called Mohamed and no two share a phone, so an
    // identifier settles in one query what a name only narrows. The names are
    // still tried, because most notes carry nothing else — and both spellings,
    // because the lists are written in Latin while the note is often Arabic.
    const clientMatches = await this.lookUp(
      (q) => this.clients.listAll(undefined, 8, q),
      reading.clientPhone,
      reading.clientCin,
      reading.clientSpoken,
      reading.clientSpokenLatin
    );

    // Same for the driver: a lorry plate is his, a first name is not.
    const transporterMatches = await this.lookUp(
      (q) => this.transporters.listAll(undefined, 8, q),
      reading.transporterPlate,
      reading.transporterCin,
      reading.transporterPhone,
      reading.transporterSpoken,
      reading.transporterSpokenLatin
    );

    // ── What the screen should offer ──────────────────────────────────────
    // Ordered by what has to be settled first: who is buying, then what is
    // being bought, then what cannot be supplied.
    const cards: Card[] = [];

    if (clientMatches.length > 1) {
      cards.push({
        type: 'client_choice',
        options: clientMatches.map((c: any) => ({
          id: (c.sk as string).split('#')[1],
          label: c.fullName,
          detail: c.phone,
        })),
      });
    } else if (reading.clientSpoken && clientMatches.length === 0) {
      cards.push({
        type: 'client_new',
        name: reading.clientSpoken,
        phone: reading.clientPhone,
        cin: reading.clientCin,
      });
    }

    if (transporterMatches.length > 1) {
      cards.push({
        type: 'driver_choice',
        options: transporterMatches.map((t: any) => ({
          id: (t.sk as string).split('#')[1],
          label: t.name,
          detail: t.vehiclePlateNumber,
        })),
      });
    } else if (reading.transporterSpoken && transporterMatches.length === 0) {
      cards.push({
        type: 'driver_new',
        name: reading.transporterSpoken,
        phone: reading.transporterPhone,
        plate: reading.transporterPlate,
      });
    }

    if (items.length > 0) cards.push({ type: 'items', lines: items });

    const short = items.filter((i) => i.short);
    if (short.length > 0) {
      cards.push({
        type: 'stock',
        lines: short.map((i) => ({
          code: i.code,
          asked: i.quantity,
          onShelf: i.stockAvailable,
        })),
      });
    }

    if (unknown.length > 0) cards.push({ type: 'unknown', words: unknown });

    if (reading.question) {
      cards.push({
        type: 'question',
        text: reading.question.text,
        options: reading.question.options,
      });
    }

    return {
      success: true,
      message: 'Order read',
      data: {
        reply: reading.reply,
        cards,
        client: {
          spoken: reading.clientSpoken,
          phone: reading.clientPhone,
          cin: reading.clientCin,
          isNew: !!reading.clientSpoken && clientMatches.length === 0,
          matches: clientMatches.map((c: any) => ({
            id: (c.sk as string).split('#')[1],
            label: c.fullName,
            detail: c.phone,
          })),
        },
        transporter: {
          spoken: reading.transporterSpoken,
          phone: reading.transporterPhone,
          plate: reading.transporterPlate,
          cin: reading.transporterCin,
          isNew: !!reading.transporterSpoken && transporterMatches.length === 0,
          matches: transporterMatches.map((t: any) => ({
            id: (t.sk as string).split('#')[1],
            label: t.name,
            detail: t.vehiclePlateNumber,
          })),
        },
        items,
        unknownItems: unknown,
        transportCost: reading.transportCost,
        address: reading.address,
        // Resolved the same way the basket is: a code that is not in the
        // catalogue does not become a drop, and a drop left with nothing on it
        // is not a drop.
        stops: reading.stops
          .map((st) => ({
            label: st.label,
            address: st.address,
            items: st.items
              .map((it) => {
                const product = byCode.get(it.code);
                return product
                  ? {
                      productId: (product.sk as string).split('#')[1],
                      code: product.code,
                      quantity: Math.max(0, it.quantity),
                    }
                  : null;
              })
              .filter((it): it is { productId: string; code: string; quantity: number } =>
                it !== null && it.quantity > 0
              ),
          }))
          .filter((st) => st.items.length > 0),
        notes: reading.notes,
        documentDate: reading.documentDate,
        warnings: reading.warnings,
      },
    };
  }
}
