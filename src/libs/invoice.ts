import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { IAddress, IOrder } from '@libs/interfaces';
import { getSettings, formatSettingsAddress, formatSettingsAddressAr } from '@libs/settings';
import { shapeArabic } from '@libs/arabic-shaper';
import { itemsForStop } from '@libs/order-stops';

/**
 * Fixed presentation values. Everything a user can change — name, phone,
 * email, address, tax id — now comes from the settings record and is passed in
 * per render. See `libs/settings.ts`.
 */
/**
 * The paper the shop already uses.
 *
 * `ink` is the near-black the body text is set in, `teal` the accent on the
 * name, the column headings and the final total.
 */
const BRAND = {
  /** Panel fill and hairline, kept light so the ink does the talking. */
  panel: '#f1f6fa',
  hairline: '#d3e1ec',
  zebra: '#f9fbfd',
  subtitleFr: "Vente d'appareils électroménagers",
  subtitleAr: "بيع الأجهزة المنزلية",
  nameAr: 'دار الخير',
  /**
   * Dar El Khir's blue, from the palette supplied with the logo (#2F7DB3).
   * The key keeps its old name so the renderer reads the same in every fork.
   */
  teal: '#2F7DB3',
  /** The deep blue of "DAR" in the wordmark, so text sits beside the mark. */
  ink: '#0A3F64',
  rule: '#4F5D75',
};

type InvoiceBrand = {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  /** Arabic twins for the right-hand side of the header. */
  nameAr?: string;
  addressAr?: string;
  taxIdAr?: string;
};

/**
 * Where the fonts and images live.
 *
 * esbuild inlines this file into each handler, so in Lambda the assets sit in
 * `data/` beside the handler. Running the renderer straight from `src` — a
 * local preview, a test — there is no such folder, so the repository copy is
 * the fallback.
 */
const ASSET_DIRS = [
  path.join(__dirname, 'data'),
  path.join(process.cwd(), 'src/functions/orders/invoice/data'),
];

function asset(file: string): string {
  for (const dir of ASSET_DIRS) {
    const candidate = path.join(dir, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(ASSET_DIRS[0], file);
}

const LOGO_PATH = asset('or-logo.png');
const WING_LEFT_PATH = asset('footer-left.png');
const WING_RIGHT_PATH = asset('footer-right.png');
const ICON_LOCATION = asset('icon-location.png');
const ICON_PHONE = asset('icon-phone.png');
const ICON_MAIL = asset('icon-mail.png');

/**
 * HealthySans, in the four weights the shop's stationery uses.
 *
 * One family covers both scripts, so Arabic and Latin on the same line finally
 * match in weight and size. The font carries no `GSUB` table, so the Arabic is
 * joined by hand before it is drawn — see `libs/arabic-shaper.ts`.
 */
const FONTS = {
  regular: asset('HealthySans-Regular.ttf'),
  medium: asset('HealthySans-Medium.ttf'),
  bold: asset('HealthySans-Bold.ttf'),
  black: asset('HealthySans-Black.ttf'),
};

const F = {
  regular: 'Sans',
  medium: 'SansMedium',
  bold: 'SansBold',
  black: 'SansBlack',
} as const;

function isArabicChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0600 && code <= 0x06FF;
}

function containsArabic(text: string): boolean {
  return text.split('').some(isArabicChar);
}

/** Split text into consecutive runs of the same script (Arabic vs Latin) */
function splitByScript(text: string): Array<{ type: 'ar' | 'en'; text: string }> {
  if (!text) return [];
  const segments: Array<{ type: 'ar' | 'en'; text: string }> = [];
  let current: { type: 'ar' | 'en'; text: string } | null = null;
  for (const char of text) {
    const type: 'ar' | 'en' = isArabicChar(char) ? 'ar' : 'en';
    if (!current || current.type !== type) {
      current = { type, text: char };
      segments.push(current);
    } else {
      current.text += char;
    }
  }
  return segments;
}

function pickFont(_text: string, bold?: boolean): string {
  // One family for both scripts now, so the only question is the weight.
  return bold ? F.bold : F.regular;
}

/**
 * Arabic and Latin come from one family now, so they already share a size.
 * The constant stays at 1 rather than disappearing, because the two scripts
 * are still measured separately and a future face may need it again.
 */
const ARABIC_SIZE_SCALE = 1;

type Word = { type: 'ar' | 'en'; text: string };

/** Splits text into words, each tagged with the script it belongs to. */
function toWords(text: string): Word[] {
  const words: Word[] = [];

  for (const chunk of text.split(/\s+/).filter(Boolean)) {
    // A word can still mix scripts, for example "1220،عين". Keep the runs.
    for (const run of splitByScript(chunk)) {
      // Arabic is joined here, once, so every later measurement and every draw
      // works on the same characters.
      words.push({ type: run.type, text: run.type === 'ar' ? shapeArabic(run.text) : run.text });
    }
  }
  return words;
}

/**
 * Puts each Arabic run into reading order.
 *
 * Arabic reads right to left, but pdfkit draws whatever it is given from left
 * to right. So the words of an Arabic phrase have to be reversed: the first
 * word of the phrase belongs at the right-hand end of the run. Latin words
 * around it keep their order.
 *
 * This is the word-level part of the bidi algorithm, which is all an address
 * needs. Full bidi would also handle nesting and neutral runs.
 */
export function reverseArabicRuns(line: Word[]): Word[] {
  const out: Word[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i].type !== 'ar') {
      out.push(line[i]);
      i += 1;
      continue;
    }

    let j = i;
    while (j < line.length && line[j].type === 'ar') j += 1;
    out.push(...line.slice(i, j).reverse());
    i = j;
  }

  return out;
}

/**
 * Breaks mixed text into lines that fit a width.
 *
 * Wrapping happens between words, not between scripts. The previous version
 * only broke at a change of script, so a long Latin address ran straight past
 * the edge of its box and the Arabic ended up alone on its own line.
 */
export function layoutMixedText(
  measure: (word: Word) => number,
  spaceWidth: (type: 'ar' | 'en') => number,
  text: string,
  width: number
): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let used = 0;

  for (const word of toWords(text)) {
    const w = measure(word);
    const gap = line.length ? spaceWidth(word.type) : 0;

    // Start a new line, unless the word is alone and simply too wide for the
    // column — in that case let it overflow rather than lose it.
    if (line.length && used + gap + w > width) {
      lines.push(line);
      line = [word];
      used = w;
      continue;
    }

    line.push(word);
    used += gap + w;
  }

  if (line.length) lines.push(line);
  return lines;
}

/**
 * Draws text that mixes Arabic and Latin, wrapping to the given width.
 *
 * Returns the height used, so the caller can size the box around it.
 */
function renderMixedText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { fontSize?: number; bold?: boolean; measureOnly?: boolean } = {}
): number {
  const fontSize = opts.fontSize ?? 10;
  const bold = opts.bold ?? false;
  const lineH = Math.ceil(fontSize * 1.45);

  const fontFor = (_type: 'ar' | 'en') => (bold ? F.bold : F.regular);

  const sizeFor = (type: 'ar' | 'en') =>
    type === 'ar' ? fontSize * ARABIC_SIZE_SCALE : fontSize;

  const apply = (type: 'ar' | 'en') => {
    doc.font(fontFor(type)).fontSize(sizeFor(type));
  };

  const measure = (word: Word) => {
    apply(word.type);
    return doc.widthOfString(word.text);
  };

  const spaceWidth = (type: 'ar' | 'en') => {
    apply(type);
    return doc.widthOfString(' ');
  };

  if (!text) {
    if (!opts.measureOnly) {
      doc.font(fontFor('en')).fontSize(fontSize).text('-', x, y, { width });
    }
    return lineH;
  }

  const lines = layoutMixedText(measure, spaceWidth, text, width);

  lines.forEach((logicalLine, row) => {
    const line = reverseArabicRuns(logicalLine);
    let cursor = x;

    line.forEach((word, i) => {
      apply(word.type);
      // Arabic sits on a slightly higher baseline once scaled up, so nudge it
      // back down to share the Latin baseline.
      const drop = word.type === 'ar' ? (fontSize * (ARABIC_SIZE_SCALE - 1)) / 2 : 0;

      if (!opts.measureOnly) {
        doc.text(word.text, cursor, y + row * lineH - drop, { lineBreak: false });
      }
      cursor += doc.widthOfString(word.text);

      if (i < line.length - 1) cursor += doc.widthOfString(' ');
    });
  });

  return Math.max(lines.length, 1) * lineH;
}

/** How tall the text will be, without drawing it. */
function measureMixedText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  opts: { fontSize?: number; bold?: boolean } = {}
): number {
  return renderMixedText(doc, text, 0, 0, width, { ...opts, measureOnly: true });
}

/**
 * Which paper is being produced.
 *
 * A proforma carries no fiscal number and says so on its face, so a client can
 * change their mind at the counter without a tax document existing yet.
 */
export type DocumentKind =
  | 'invoice'
  | 'proforma'
  | 'credit_note'
  /**
   * The paper the tax authority sees: the buyer's fiscal identity, a number
   * the shop typed rather than one a counter handed out, and no lorry on it —
   * a declared invoice records a sale, not a delivery.
   */
  | 'declared'
  | 'stop'
  /** Bon de livraison: what the client signs when the goods come off the lorry. */
  | 'delivery_note'
  /** The invoice and a delivery note per drop, in one file, one print job. */
  | 'bundle';

/** Every kind that is a single sheet — a bundle is made of these. */
export type PageKind = Exclude<DocumentKind, 'bundle'>;

type InvoiceContext = {
  /**
   * Which drop on the round to print, counting from 1.
   *
   * Read for `kind: 'stop'` and for a `delivery_note` covering one drop. The
   * stop paper is the invoice in every respect
   * the client cares about — same header, same tax number — but it carries
   * that stop's address and that stop's share of the goods, under the invoice
   * number with the stop appended: 004-1, 004-2.
   */
  stopIndex?: number;
  clientPhone?: string;
  /** Identity card number, printed on the client box. */
  clientCin?: string;
  /**
   * The buyer's own tax number, printed under his name when he has one. A
   * business buying from the shop needs it on the paper; a private buyer has
   * none, and the line is left off rather than printed empty.
   */
  clientTaxId?: string;
  kind?: DocumentKind;
  /**
   * The number printed on a declared invoice.
   *
   * A string, and typed by hand, because these numbers are not ours to make
   * up: they run in the sequence the accountant keeps, which is why the shop
   * enters them and why one may never be reused.
   */
  declaredNumber?: string;
  /** How a declared invoice was settled, printed where the lorry would be. */
  declaredPayment?: string;
  /** Business identity for the header. Defaults to the settings record. */
  brand?: InvoiceBrand;
  transporter?: {
    name?: string;
    phone?: string;
    cin?: string;
    vehiclePlateNumber?: string;
  };
};

function f3(n: number) {
  return Number.isFinite(n) ? n.toFixed(3) : '0.000';
}

function formatPrice(n: number): string {
  const formatted = f3(n);
  // Add space as thousands separator
  return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * One readable address line.
 *
 * Workers often type the whole address into the street field, so the city,
 * state and postcode then repeat. A part already present in what came before
 * is dropped rather than printed twice.
 */
/**
 * Where a drop is, as printed on its paper.
 *
 * Only the line someone actually typed for the stop. Stops saved before the
 * address was reduced to that one line still carry a town and a postcode
 * copied from the client's address — nobody wrote them for this drop, and a
 * chantier on a back road is not improved by a postcode from somewhere else.
 */
export function stopAddressLine(stop: { address?: { street?: string } }): string {
  return (stop.address?.street ?? '').trim();
}

export function orderAddress(order: { shippingAddress?: Partial<IAddress> }): string {
  const a = order.shippingAddress;
  if (!a) return '-';

  const parts: string[] = [];
  const seen: string[] = [];

  for (const part of [a.street, a.city, a.state, a.postalCode, a.country]) {
    const value = (part ?? '').trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.some((s) => s === key || s.includes(key))) continue;

    parts.push(value);
    seen.push(key);
  }

  return parts.join(', ');
}

type Line = {
  index: number;
  code: string;
  name: string;
  qty: number;
  taxRate: number;
  unitHT: number;
  unitTTC: number;
  discount: string;
  totalHT: number;
};

function lineData(order: IOrder): Line[] {
  return order.items.map((item, i) => {
    const unitTTC = item.discountedPrice ?? item.priceTTC;
    const unitHT = item.discountedPrice
      ? item.discountedPrice / (1 + item.taxRate / 100)
      : item.priceHT;
    return {
      index: i + 1,
      code: item.code,
      name: item.name,
      qty: item.quantity,
      taxRate: item.taxRate,
      unitHT,
      unitTTC,
      discount: item.discountPercentage ? `${item.discountPercentage}%` : '-',
      totalHT: unitHT * item.quantity,
    };
  });
}

/**
 * The date that goes on the paper.
 *
 * A worker sometimes writes an invoice the night before it is handed over, so
 * `documentDate` wins when it is set. Otherwise it is the day the document was
 * issued, and failing that the day the order was taken.
 */
export function printedDate(
  order: Pick<IOrder, 'documentDate' | 'invoiceIssuedAt' | 'createdAt'>,
): string {
  const chosen =
    order.documentDate?.trim() ||
    order.invoiceIssuedAt ||
    order.createdAt ||
    new Date().toISOString();
  return chosen.slice(0, 10);
}

function formatOrderNumber(orderNumber?: number) {
  if (!Number.isFinite(orderNumber as number)) return '-';
  return String(orderNumber).padStart(3, '0');
}

function toFrenchBelow100(n: number): string {
  const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

  if (n < 10) return units[n];
  if (n < 20) return teens[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return tens[t];
    if (u === 1) return `${tens[t]} et un`;
    return `${tens[t]}-${units[u]}`;
  }
  if (n < 80) {
    if (n === 71) return 'soixante et onze';
    return `soixante-${toFrenchBelow100(n - 60)}`;
  }
  if (n === 80) return 'quatre-vingts';
  if (n < 100) return `quatre-vingt-${toFrenchBelow100(n - 80)}`;
  return '';
}

function toFrenchBelow1000(n: number): string {
  if (n < 100) return toFrenchBelow100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds === 1) {
    return rest === 0 ? 'cent' : `cent ${toFrenchBelow100(rest)}`;
  }

  const hundredWord = rest === 0 ? 'cents' : 'cent';
  return rest === 0
    ? `${toFrenchBelow100(hundreds)} ${hundredWord}`
    : `${toFrenchBelow100(hundreds)} cent ${toFrenchBelow100(rest)}`;
}

function numberToFrench(n: number): string {
  if (n === 0) return 'zéro';

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : `${toFrenchBelow1000(millions)} millions`);
  }

  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${toFrenchBelow1000(thousands)} mille`);
  }

  if (rest > 0) {
    parts.push(toFrenchBelow1000(rest));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function amountInLetters(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const dinars = Math.floor(safe);
  const millimes = Math.round((safe - dinars) * 1000);

  const dinarsWords = numberToFrench(dinars);
  const millimesWords = numberToFrench(millimes);

  return `${dinarsWords} dinars et ${millimesWords} millimes`;
}

function getWrappedCellHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  opts?: { bold?: boolean; fontSize?: number }
): number {
  const fontSize = opts?.fontSize ?? 9;
  const font = pickFont(text, opts?.bold);
  doc.font(font).fontSize(fontSize);
  return doc.heightOfString(text || '-', { width: Math.max(1, width - 8) }) + 8;
}

function drawCell(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, text: string, opts?: { align?: 'left' | 'center' | 'right'; bold?: boolean; fill?: string }) {
  if (opts?.fill) {
    doc.rect(x, y, w, h).fill(opts.fill);
    doc.fillColor('#0f172a');
  }
  doc.rect(x, y, w, h).lineWidth(0.8).stroke(BRAND.ink);
  doc.fillColor(BRAND.ink);
  const safeText = text || '-';
  if (containsArabic(safeText)) {
    renderMixedText(doc, safeText, x + 4, y + 4, w - 8, { fontSize: 9, bold: opts?.bold });
  } else {
    doc.font(opts?.bold ? F.bold : F.regular).fontSize(9).text(safeText, x + 4, y + 4, {
      width: w - 8,
      height: h - 8,
      align: opts?.align ?? 'left',
      lineBreak: true,
    });
  }
}

/** Draws a small icon, vertically centred against a line of text. */
function icon(doc: PDFKit.PDFDocument, file: string, x: number, y: number, size = 8) {
  if (fs.existsSync(file)) doc.image(file, x, y, { fit: [size, size] });
}

/**
 * A line of Arabic, laid out from the right edge inwards.
 *
 * The icon sits furthest right, then the Arabic label, then any Latin value —
 * a phone number or a tax id — which keeps its own left-to-right order. Mixing
 * the value into the label string instead would strand the colon on the wrong
 * side of the number.
 */
function arabicLine(
  doc: PDFKit.PDFDocument,
  text: string,
  rightEdge: number,
  y: number,
  opts: {
    size?: number;
    font?: string;
    color?: string;
    iconFile?: string;
    value?: string;
  } = {},
) {
  const size = opts.size ?? 7.5;
  doc.font(opts.font ?? F.regular).fontSize(size).fillColor(opts.color ?? BRAND.ink);

  let edge = rightEdge;
  if (opts.iconFile) {
    icon(doc, opts.iconFile, edge - size, y + 0.5, size);
    edge -= size + 4;
  }

  const drawn = shapeArabic(text);
  edge -= doc.widthOfString(drawn);
  doc.text(drawn, edge, y, { lineBreak: false });

  if (opts.value) {
    edge -= 4 + doc.widthOfString(opts.value);
    doc.text(opts.value, edge, y, { lineBreak: false });
  }
}

/** A line of Latin text with its icon on the left-hand edge. */
function latinLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; font?: string; color?: string; iconFile?: string } = {},
) {
  const size = opts.size ?? 7.5;
  doc.font(opts.font ?? F.regular).fontSize(size).fillColor(opts.color ?? BRAND.ink);

  let cursor = x;
  if (opts.iconFile) {
    icon(doc, opts.iconFile, cursor, y + 0.5, size);
    cursor += size + 4;
  }
  doc.text(text, cursor, y, { lineBreak: false });
}

/** A soft panel: fill plus a hairline, instead of a heavy black rectangle. */
function panel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: string; radius?: number } = {},
) {
  const r = opts.radius ?? 3;
  doc.roundedRect(x, y, w, h, r).fillAndStroke(opts.fill ?? BRAND.panel, BRAND.hairline);
  doc.fillColor(BRAND.ink);
}

/** A small teal caption above a value — the label style used on every block. */
function caption(doc: PDFKit.PDFDocument, text: string, x: number, y: number) {
  doc.font(F.bold).fontSize(6).fillColor(BRAND.teal).text(text.toUpperCase(), x, y, {
    characterSpacing: 0.6,
    lineBreak: false,
  });
}

/** A heading with a rule under it, as on the printed original. */
function underlined(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { size?: number; align?: 'left' | 'center' | 'right'; color?: string } = {},
) {
  const size = opts.size ?? 8;
  doc.font(F.bold).fontSize(size).fillColor(opts.color ?? BRAND.ink);
  doc.text(text, x, y, { width, align: opts.align ?? 'center' });

  const w = doc.widthOfString(text);
  const align = opts.align ?? 'center';
  const startX = align === 'center' ? x + (width - w) / 2 : align === 'right' ? x + width - w : x;

  doc
    .moveTo(startX, y + size + 2)
    .lineTo(startX + w, y + size + 2)
    .lineWidth(0.6)
    .stroke(opts.color ?? BRAND.ink);
}

/** One paper, drawn on the page pdfkit is currently on. */
function drawDocument(
  doc: PDFKit.PDFDocument,
  params: {
    order: IOrder;
    settings: Awaited<ReturnType<typeof getSettings>>;
    brand: InvoiceBrand;
    kind: PageKind;
    stopIndex?: number;
    context?: InvoiceContext;
  },
) {
  const { order, settings, brand, kind, stopIndex, context } = params;

  // A stop paper is the same invoice, narrowed to one drop: this address, and
  // only the goods that come off the lorry here. A delivery note is narrowed
  // the same way when it is for one drop, and covers the load when it is not.
  const stop =
    kind === 'stop' || (kind === 'delivery_note' && stopIndex !== undefined)
      ? (order.stops ?? [])[(stopIndex ?? 1) - 1]
      : undefined;

  if (kind === 'stop' && !stop) {
    throw new Error(`Stop ${stopIndex} does not exist on this order`);
  }
  if (kind === 'delivery_note' && stopIndex !== undefined && !stop) {
    throw new Error(`Stop ${stopIndex} does not exist on this order`);
  }

  const printedItems = stop ? itemsForStop(order.items, stop) : order.items;

  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const L = 48;
  const R = PAGE_W - 48;

  /* ── Header ─────────────────────────────────────────────────────────── */

  const headTop = 40;

  // The paper carries both numbers when a second one is set.
  const phones = [brand.phone, settings.secondaryPhone].filter(Boolean).join(' — ');

  // Left: the name and how to reach the shop.
  doc.font(F.black).fontSize(15).fillColor(BRAND.teal).text(brand.name.toUpperCase(), L, headTop, {
    characterSpacing: 0.4,
    lineBreak: false,
  });
  doc.font(F.bold).fontSize(7).fillColor(BRAND.ink).text(BRAND.subtitleFr, L, headTop + 20, {
    characterSpacing: 0.3,
    lineBreak: false,
  });

  let ly = headTop + 36;
  latinLine(doc, brand.address, L, ly, { iconFile: ICON_LOCATION });
  ly += 12;
  latinLine(doc, phones, L, ly, { iconFile: ICON_PHONE });
  ly += 12;
  latinLine(doc, brand.email, L, ly, { iconFile: ICON_MAIL });
  ly += 12;
  latinLine(doc, `MF ${brand.taxId}`, L, ly);

  // Middle: the mark.
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, PAGE_W / 2 - 55, headTop - 4, {
      fit: [110, 66],
      align: 'center',
      valign: 'center',
    });
  }

  // Right: the same again in Arabic, read from the right edge inwards.
  doc.font(F.black).fontSize(13).fillColor(BRAND.teal);
  const nameAr = shapeArabic(brand.nameAr || BRAND.nameAr);
  doc.text(nameAr, R - doc.widthOfString(nameAr), headTop + 2, { lineBreak: false });

  arabicLine(doc, BRAND.subtitleAr, R, headTop + 20, { size: 8, font: F.bold });

  let ry = headTop + 36;
  arabicLine(doc, brand.addressAr || brand.address, R, ry, { iconFile: ICON_LOCATION });
  ry += 12;
  arabicLine(doc, 'الهاتف :', R, ry, { iconFile: ICON_PHONE, value: phones });
  ry += 12;
  arabicLine(doc, 'المعرف الوحيد :', R, ry, { value: brand.taxIdAr || brand.taxId });

  /* ── Reference and client ───────────────────────────────────────────── */

  const boxTop = 148;
  const heading =
    kind === 'proforma'
      ? 'Devis'
      : kind === 'credit_note'
        ? 'Avoir'
        : kind === 'delivery_note'
          ? 'Bon de livraison'
          : 'Facture';

  const reference =
    kind === 'declared'
      ? (context?.declaredNumber ?? '-')
      : kind === 'proforma'
      ? formatOrderNumber(order.orderNumber)
      : kind === 'credit_note'
        ? `AV-${formatOrderNumber(order.creditNoteNumber)}`
        : kind === 'stop'
          ? // The fiscal number, then which drop it is: 004-1.
            `${formatOrderNumber(order.invoiceNumber ?? order.orderNumber)}-${stopIndex}`
          : kind === 'delivery_note'
            ? // The note rides with the goods, so it is marked BL and carries the
              // number of the invoice it belongs to — with the drop when it is
              // for one drop: BL-004-1.
              `BL-${formatOrderNumber(order.invoiceNumber ?? order.orderNumber)}${
                stopIndex !== undefined ? `-${stopIndex}` : ''
              }`
            : formatOrderNumber(order.invoiceNumber ?? order.orderNumber);

  const issuedAt = printedDate(order);
  const address = stop ? stopAddressLine(stop) || '-' : orderAddress(order) || '-';

  // One band across the page rather than two floating rectangles: the document
  // on the left, who it is for on the right, separated by a hairline.
  const metaW = 176;
  const gap = 14;
  const cliX = L + metaW + gap;
  const cliW = R - cliX;

  doc.font(F.medium).fontSize(9);
  const addrH = measureMixedText(doc, address, cliW / 2 - 20, { fontSize: 9 });
  doc.font(F.bold).fontSize(10);
  const clientNameH = doc.heightOfString(order.clientName || '-', { width: cliW / 2 - 20 });

  // What the left column costs: the caption, the name over however many lines
  // it takes, the address caption, and the address itself.
  const clientH = 26 + clientNameH + 10 + addrH + 14;
  // The right column: mobile, CIN, and the tax number when there is one.
  const rightH = context?.clientTaxId ? 96 : 74;
  const bandH = Math.max(rightH, clientH);

  panel(doc, L, boxTop, metaW, bandH);
  panel(doc, cliX, boxTop, cliW, bandH, { fill: '#ffffff' });

  // Left: what this paper is.
  // "BON DE LIVRAISON" is twice the length of "FACTURE", so the heading is set
  // to whatever size still fits the panel rather than to a fixed 16pt.
  doc.font(F.black).fontSize(16).fillColor(BRAND.teal);
  const headingText = heading.toUpperCase();
  const headingSize = Math.min(16, ((metaW - 24) / doc.widthOfString(headingText)) * 16);
  doc.fontSize(headingSize);
  doc.text(headingText, L + 12, boxTop + 12 + (16 - headingSize) * 0.6, {
    characterSpacing: 0.6,
    lineBreak: false,
  });

  caption(doc, 'N°', L + 12, boxTop + 36);
  doc.font(F.black).fontSize(12).fillColor(BRAND.ink);
  doc.text(reference, L + 12, boxTop + 45, { lineBreak: false });

  caption(doc, 'Date', L + 96, boxTop + 36);
  doc.font(F.medium).fontSize(9).fillColor(BRAND.ink);
  doc.text(issuedAt, L + 96, boxTop + 47, { lineBreak: false });

  // Right: who it is for. Small teal captions, values under them.
  const c1 = cliX + 12;
  const c2 = cliX + cliW / 2 + 4;

  // A name is one field and can be a company: "Elabbessi Badreddinne Ben
  // Ennaser – Service Agricoles" is a real client here. It is allowed to wrap,
  // and what follows is placed under however many lines it took — pinned to a
  // fixed offset, the address printed straight through the second line of it.
  const nameW = cliW / 2 - 20;
  doc.font(F.bold).fontSize(10);
  const nameH = doc.heightOfString(order.clientName || '-', { width: nameW });

  caption(doc, 'Client', c1, boxTop + 12);
  doc.fillColor(BRAND.ink);
  doc.text(order.clientName || '-', c1, boxTop + 22, { width: nameW });

  caption(doc, 'Mobile', c2, boxTop + 12);
  doc.font(F.medium).fontSize(9).fillColor(BRAND.ink);
  doc.text(context?.clientPhone ?? '-', c2, boxTop + 22, { lineBreak: false });

  caption(doc, 'CIN', c2, boxTop + 40);
  doc.font(F.medium).fontSize(9).fillColor(BRAND.ink);
  doc.text(context?.clientCin ?? '-', c2, boxTop + 50, { lineBreak: false });

  // Only for a buyer who has one. A private client has no matricule fiscal,
  // and an empty "MF" on the paper reads like something went missing.
  if (context?.clientTaxId) {
    caption(doc, 'MF', c2, boxTop + 62);
    doc.font(F.medium).fontSize(9).fillColor(BRAND.ink);
    doc.text(context.clientTaxId, c2, boxTop + 72, { lineBreak: false });
  }

  const addrTop = boxTop + 26 + nameH;
  caption(doc, 'Adresse', c1, addrTop);
  renderMixedText(doc, address, c1, addrTop + 10, nameW, { fontSize: 9 });

  // A proforma has to say on its face that it is not an invoice.
  if (kind === 'proforma') {
    doc.font(F.bold).fontSize(7).fillColor('#b91c1c');
    doc.text("CECI N'EST PAS UNE FACTURE", L, boxTop + bandH + 6, { lineBreak: false });
    doc.fillColor(BRAND.ink);
  }

  // Why the invoice was cancelled belongs on the avoir itself.
  if (kind === 'credit_note' && order.creditNoteReason) {
    doc.font(F.medium).fontSize(7.5).fillColor(BRAND.ink);
    doc.text(`Motif: ${order.creditNoteReason}`, L, boxTop + bandH + 6, { width: R - L });
  }

  /* ── Items ──────────────────────────────────────────────────────────── */

  let y = boxTop + bandH + 28;

  const cols = [
    { key: 'ord', label: 'Ord', width: 34, align: 'center' as const },
    { key: 'ref', label: 'Réf Produit', width: 70, align: 'left' as const },
    { key: 'name', label: 'Libellé / Désignation', width: 176, align: 'left' as const },
    { key: 'qty', label: 'Qté', width: 34, align: 'center' as const },
    { key: 'uht', label: 'P.Unit HT', width: 66, align: 'right' as const },
    { key: 'tva', label: 'TVA', width: 42, align: 'center' as const },
    { key: 'tht', label: 'Total HT', width: 77, align: 'right' as const },
  ];
  const tableW = cols.reduce((sum, c) => sum + c.width, 0);

  // A filled teal band with white type, and no vertical rules anywhere. The
  // eye follows a row far better without a full grid boxing every figure in.
  const headH = 20;
  doc.rect(L, y, tableW, headH).fill(BRAND.teal);

  let x = L;
  for (const c of cols) {
    doc.font(F.bold).fontSize(7).fillColor('#ffffff');
    doc.text(c.label.toUpperCase(), x + 4, y + 7, {
      width: c.width - 8,
      align: c.align === 'right' ? 'right' : c.align,
      characterSpacing: 0.4,
      lineBreak: false,
    });
    x += c.width;
  }

  const lines = lineData({ ...order, items: printedItems });
  let rowY = y + headH;

  lines.forEach((line, i) => {
    const values = [
      String(line.index),
      line.code,
      line.name,
      String(line.qty),
      formatPrice(line.unitHT),
      `${line.taxRate} %`,
      formatPrice(line.totalHT),
    ];

    doc.font(F.medium).fontSize(8.5);
    const nameH = doc.heightOfString(values[2], { width: cols[2].width - 12 });
    const rowHeight = Math.max(22, nameH + 12);

    if (i % 2 === 1) doc.rect(L, rowY, tableW, rowHeight).fill(BRAND.zebra);

    x = L;
    cols.forEach((c, idx) => {
      const bold = idx === 6;
      doc.font(bold ? F.bold : F.medium).fontSize(8.5).fillColor(BRAND.ink);
      doc.text(values[idx], x + 6, rowY + 6, {
        width: c.width - 12,
        align: c.align,
      });
      x += c.width;
    });

    // One hairline under each row, and nothing between the columns.
    doc
      .moveTo(L, rowY + rowHeight)
      .lineTo(L + tableW, rowY + rowHeight)
      .lineWidth(0.5)
      .stroke(BRAND.hairline);

    rowY += rowHeight;
  });

  // Keep the block a sensible depth even for a one-line order.
  for (let i = lines.length; i < 2; i += 1) {
    if (i % 2 === 1) doc.rect(L, rowY, tableW, 22).fill(BRAND.zebra);
    doc
      .moveTo(L, rowY + 22)
      .lineTo(L + tableW, rowY + 22)
      .lineWidth(0.5)
      .stroke(BRAND.hairline);
    rowY += 22;
  }

  /* ── Totals ─────────────────────────────────────────────────────────── */

  const totalHT = lines.reduce((s, l) => s + l.totalHT, 0);

  // The stamp is a tax on the invoice and the transport is for the whole
  // round, so both belong to the one fiscal paper. Putting them on each drop
  // would charge them two and three times over, and the stops would no longer
  // add back up to the invoice.
  const timber = stop ? 0 : (order.timber ?? settings.stampTax);
  const transport = stop ? 0 : (order.transport ?? 0);

  // A stop carries only its own share, so its tax and its total are worked out
  // from the lines printed on it rather than taken from the order.
  const tax = stop
    ? lines.reduce((sum, l) => sum + l.totalHT * (l.taxRate / 100), 0)
    : order.tax;
  const grandTotal = stop
    ? parseFloat((totalHT + tax).toFixed(3))
    : order.total;

  const rows: [string, string][] = [
    ['Total HT', formatPrice(totalHT)],
    [`TVA ${settings.defaultTaxRate} %`, formatPrice(tax)],
  ];
  if (timber > 0) rows.push(['Timbre', formatPrice(timber)]);
  // Transport is part of what the client pays, so it cannot be left off the
  // paper even though the original template has no row for it.
  if (transport > 0) rows.push(['Transport', formatPrice(transport)]);


  const totW = 226;
  const totX = L + tableW - totW;
  const rowH = 18;
  let totY = rowY + 20;

  for (const [labelText, value] of rows) {
    doc.font(F.medium).fontSize(8.5).fillColor('#54706c');
    doc.text(labelText, totX + 10, totY + 5, { width: 110, lineBreak: false });
    doc.font(F.medium).fillColor(BRAND.ink);
    doc.text(value, totX + 120, totY + 5, { width: totW - 130, align: 'right', lineBreak: false });
    doc
      .moveTo(totX + 10, totY + rowH)
      .lineTo(totX + totW - 10, totY + rowH)
      .lineWidth(0.5)
      .stroke(BRAND.hairline);
    totY += rowH;
  }

  // The number that matters, set apart in a solid band.
  const ttcH = 28;
  doc.roundedRect(totX, totY + 4, totW, ttcH, 3).fill(BRAND.teal);
  doc.font(F.black).fontSize(10).fillColor('#ffffff');
  doc.text('TOTAL TTC', totX + 12, totY + 14, { lineBreak: false });
  doc.font(F.black).fontSize(12);
  doc.text(formatPrice(grandTotal), totX + 100, totY + 12, {
    width: totW - 112,
    align: 'right',
    lineBreak: false,
  });
  totY += 4 + ttcH;

  /* ── Amount in words ────────────────────────────────────────────────── */

  const wordsW = totX - L - 16;
  const wordsY = rowY + 20;
  // "Facture" is feminine and "devis"/"avoir" are masculine, so the article
  // follows the noun rather than the kind — a stop paper is still a facture.
  const noun =
    kind === 'proforma'
      ? 'devis'
      : kind === 'credit_note'
        ? 'avoir'
        : kind === 'delivery_note'
          ? 'bon de livraison'
          : 'facture';
  const article = noun === 'facture' ? 'la présente' : 'le présent';
  const sentence = `Arrêté ${article} ${noun} à la somme de : ${amountInLetters(grandTotal)}`;

  doc.font(F.bold).fontSize(8.5);
  const wordsH = doc.heightOfString(sentence, { width: wordsW - 24 }) + 28;

  panel(doc, L, wordsY, wordsW, wordsH);
  caption(doc, 'Montant en lettres', L + 12, wordsY + 10);
  doc.font(F.bold).fontSize(8.5).fillColor(BRAND.ink);
  doc.text(sentence, L + 12, wordsY + 22, { width: wordsW - 24 });

  /* ── Delivery details ───────────────────────────────────────────────── */

  const lowerY = Math.max(totY, wordsY + wordsH) + 22;
  const delW = 292;

  // A declared invoice records a sale, not a journey. Naming a driver and a
  // lorry on it would be inventing a delivery the paper makes no claim about —
  // and the same goods often travel under a second, undeclared paper in
  // someone else's name, so the two must not contradict each other.
  const showsDelivery = kind !== 'declared';

  const driverRows: [string, string][] = [
    ['Chauffeur', context?.transporter?.name ?? order.transporterName ?? '-'],
    ['CIN', context?.transporter?.cin ?? '-'],
    ['Immatriculation', context?.transporter?.vehiclePlateNumber ?? '-'],
  ];
  // The number is shown only when there is one — a driver may not have given it.
  if (context?.transporter?.phone) driverRows.push(['Téléphone', context.transporter.phone]);

  doc.font(F.medium).fontSize(8);
  const destH = measureMixedText(doc, address, delW - 110, { fontSize: 8 });
  const delH = 26 + driverRows.length * 14 + Math.max(14, destH) + 12;

  // A declared invoice says how it was settled instead of who carried it.
  // The band would otherwise be half empty, and "mode de règlement" is a line
  // the tax authority expects to find on the paper.
  if (!showsDelivery && context?.declaredPayment) {
    const payH = 26 + 14 + 12;
    panel(doc, L, lowerY, delW, payH, { fill: '#ffffff' });
    caption(doc, 'Mode de payement', L + 12, lowerY + 10);
    doc.font(F.medium).fontSize(9).fillColor(BRAND.ink);
    doc.text(context.declaredPayment, L + 12, lowerY + 26, {
      width: delW - 24,
      lineBreak: false,
    });
  }

  if (showsDelivery) {
    panel(doc, L, lowerY, delW, delH, { fill: '#ffffff' });
    caption(doc, 'Détails de la livraison', L + 12, lowerY + 10);

    let dy = lowerY + 24;
    for (const [labelText, value] of driverRows) {
      doc.font(F.medium).fontSize(8).fillColor('#54706c');
      doc.text(labelText, L + 12, dy, { width: 88, lineBreak: false });
      doc.font(F.medium).fillColor(BRAND.ink);
      doc.text(value, L + 104, dy, { width: delW - 116, lineBreak: false });
      dy += 14;
    }

    doc.font(F.medium).fontSize(8).fillColor('#54706c');
    doc.text('Destination', L + 12, dy, { width: 88, lineBreak: false });
    renderMixedText(doc, address, L + 104, dy, delW - 116, { fontSize: 8 });
  }

  /* ── Signature ──────────────────────────────────────────────────────── */

  const sigW = 180;
  const sigX = R - sigW;
  panel(doc, sigX, lowerY, sigW, delH, { fill: '#ffffff' });

  if (kind === 'delivery_note') {
    // The note is the proof the goods arrived, so the space is the client's to
    // sign — the shop's stamp goes on the invoice.
    caption(doc, 'Reçu par — nom & signature', sigX + 12, lowerY + 10);
    doc.font(F.medium).fontSize(8).fillColor('#54706c');
    doc.text(`Le ${issuedAt}`, sigX + 12, lowerY + delH - 22, { width: sigW - 24 });
    doc
      .moveTo(sigX + 12, lowerY + delH - 28)
      .lineTo(sigX + sigW - 12, lowerY + delH - 28)
      .lineWidth(0.5)
      .stroke(BRAND.hairline);
  } else {
    caption(doc, 'Signature & Cachet', sigX + 12, lowerY + 10);
    doc.font(F.bold).fontSize(9).fillColor(BRAND.ink);
    doc.text(brand.name, sigX + 12, lowerY + 24, { width: sigW - 24 });
    doc.font(F.medium).fontSize(8).fillColor('#54706c');
    // The town comes from the shop's own settings; it was written into the
    // renderer, which is fine for one shop and wrong for the next one.
    const signedAt = [settings.city, issuedAt].filter(Boolean).join(', le ');
    doc.text(signedAt, sigX + 12, lowerY + 38, { width: sigW - 24 });
  }

  /* ── Footer wings ───────────────────────────────────────────────────── */

  // Drawn last so nothing above can paint over them, and anchored to the very
  // bottom of the sheet: on the original they were cut off by the slide edge.
  const wingH = 92;
  // They stop short of the middle on purpose: the white gap between them is
  // where the mark sits, the way it does on the shop's own paper.
  const wingW = PAGE_W * 0.42;

  if (fs.existsSync(WING_LEFT_PATH)) {
    doc.image(WING_LEFT_PATH, 0, PAGE_H - wingH, { width: wingW, height: wingH });
  }
  if (fs.existsSync(WING_RIGHT_PATH)) {
    doc.image(WING_RIGHT_PATH, PAGE_W - wingW, PAGE_H - wingH, { width: wingW, height: wingH });
  }
  // Sits low in the gap the two wings leave between them. The mark carries an
  // alpha channel, so nothing shows behind it wherever it lands.
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, PAGE_W / 2 - 30, PAGE_H - wingH + 47, {
      fit: [60, 38],
      align: 'center',
      valign: 'center',
    });
  }

}

/** The pages a request turns into, in the order they are printed. */
export function documentSections(
  order: IOrder,
  kind: DocumentKind,
  stopIndex?: number,
): { kind: PageKind; stopIndex?: number }[] {
  if (kind !== 'bundle') return [{ kind, stopIndex }];

  // The dossier is the whole round in one file: the fiscal invoice first, then
  // each drop's own pair — its invoice (004-1) and its delivery note — kept
  // together, because that is how they are handed over. An order with no stops
  // is one drop, so the invoice is followed by a single note.
  const first = { kind: (order.invoiceNumber ? 'invoice' : 'proforma') as PageKind };
  const stops = order.stops ?? [];

  if (!stops.length) return [first, { kind: 'delivery_note' as PageKind }];

  return [
    first,
    ...stops.flatMap((_, i) => [
      { kind: 'stop' as PageKind, stopIndex: i + 1 },
      { kind: 'delivery_note' as PageKind, stopIndex: i + 1 },
    ]),
  ];
}

export async function renderOrderInvoicePdf(order: IOrder, context?: InvoiceContext): Promise<Buffer> {
  // Read the business identity once per render. getSettings() caches and never
  // throws, so a settings outage still produces an invoice.
  const settings = await getSettings();
  const brand: InvoiceBrand = context?.brand ?? {
    name: settings.businessName,
    phone: settings.phone,
    email: settings.email,
    address: formatSettingsAddress(settings),
    taxId: settings.taxId,
    nameAr: settings.businessNameAr,
    addressAr: formatSettingsAddressAr(settings),
    taxIdAr: settings.taxIdAr,
  };

  // The default font is set here on purpose. Left alone, pdfkit loads
  // Helvetica the moment the document is created, and Helvetica's metrics are
  // read from `<bundle>/data/Helvetica.afm` — a file that only exists because
  // it was copied there for that one call. Naming our own font instead means
  // no standard-font metrics are ever needed.
  const doc = new PDFDocument({ size: 'A4', margin: 0, font: FONTS.regular });
  const chunks: Buffer[] = [];

  doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  for (const [name, file] of [
    [F.regular, FONTS.regular],
    [F.medium, FONTS.medium],
    [F.bold, FONTS.bold],
    [F.black, FONTS.black],
  ] as const) {
    if (fs.existsSync(file)) doc.registerFont(name, file);
  }

  // pdfkit opens the first page with the document, so only the ones after it
  // are added here.
  documentSections(order, context?.kind ?? 'invoice', context?.stopIndex).forEach((section, i) => {
    if (i > 0) doc.addPage();
    drawDocument(doc, { order, settings, brand, context, ...section });
  });

  doc.end();
  return done;
}
