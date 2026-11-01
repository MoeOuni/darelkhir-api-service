import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import { STATIONERY, registerStationeryFonts, layoutMixedText, reverseArabicRuns } from '@libs/invoice';

/**
 * Price tickets for the shop floor, eight to an A4 sheet.
 *
 * Each one is 105 × 74 mm — a quarter of an A5, the usual size for a price card
 * on an appliance — so the price reads from across the showroom while two
 * columns of four still fill the sheet edge to edge. Cut lines are printed
 * between them for plain paper; on a sheet of 8 stickers they fall on the
 * die-cuts.
 *
 * Drawn with the invoice's own fonts, mark and blue, so the ticket on the
 * fridge and the invoice handed over for it read as one shop.
 */

const { BRAND, F, LOGO_PATH } = STATIONERY;

/** A4 in points. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;

export const COLUMNS = 2;
export const ROWS = 4;
export const TICKETS_PER_PAGE = COLUMNS * ROWS;

const CELL_W = PAGE_W / COLUMNS;
const CELL_H = PAGE_H / ROWS;
const PAD = 18;

/** Light enough to vanish once cut, dark enough to cut along. */
const CUT_LINE = '#c4cfda';
const MUTED = '#6b7a8c';

/** Only what a ticket shows. Never the purchase price. */
export type TicketProduct = {
  code: string;
  name: { fr: string; ar: string };
  priceTTC?: number;
  discountedPrice?: number;
  discountPercentage?: number;
};

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** "1 499.400" — the same figures the invoice prints. */
export function formatTicketPrice(n: number): string {
  return n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * What the ticket says the article costs.
 *
 * A reduced price is shown as the price, with the catalogue price struck
 * through above it, but only when it really is lower — a "reduction" that
 * charges the same or more is a setting mistake, not a promotion, and the
 * shop floor is the worst place to advertise it.
 *
 * Null when there is nothing to print: a ticket reading 0.000 on a fridge is
 * worse than no ticket.
 */
export function ticketPrice(
  p: TicketProduct,
): { price: number; was?: number; percent?: number } | null {
  const list = positive(p.priceTTC) ? p.priceTTC : undefined;
  const reduced = positive(p.discountedPrice) ? p.discountedPrice : undefined;

  if (reduced !== undefined && (list === undefined || reduced < list)) {
    if (list === undefined) return { price: reduced };
    const percent = positive(p.discountPercentage)
      ? Math.round(p.discountPercentage)
      : Math.round(((list - reduced) / list) * 100);
    return { price: reduced, was: list, percent: percent > 0 ? percent : undefined };
  }

  return list !== undefined ? { price: list } : null;
}

export function pagesFor(tickets: number): number {
  return Math.max(1, Math.ceil(tickets / TICKETS_PER_PAGE));
}

type Word = { type: 'ar' | 'en'; text: string };

/**
 * A line of an Arabic paragraph, in the order it is drawn left to right.
 *
 * The invoice's reordering is for the opposite case — a French line with a
 * stretch of Arabic in it, like an address — and reverses only the Arabic
 * runs. An Arabic name runs right to left as a whole, so the entire line is
 * reversed; only a run of numbers or Latin words ("7", "No Frost") keeps its
 * own order inside. Using the invoice's version here printed
 * "دورة سوداء 1000 كغ 7 غسالة" for "غسالة … 7 كغ 1000 دورة سوداء".
 */
export function rtlVisualOrder(line: Word[]): Word[] {
  const out: Word[] = [];
  let i = line.length - 1;
  while (i >= 0) {
    if (line[i].type === 'ar') {
      out.push(line[i]);
      i -= 1;
      continue;
    }
    let j = i;
    while (j >= 0 && line[j].type !== 'ar') j -= 1;
    out.push(...line.slice(j + 1, i + 1));
    i = j;
  }
  return out;
}

/**
 * Mixed Arabic and Latin, wrapped and aligned.
 *
 * The invoice's own layout does the wrapping and the joining. Right-aligned
 * text is taken to be an Arabic paragraph and ordered right to left; left-
 * aligned text is French with the invoice's handling of any Arabic inside it.
 */
function drawMixed(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { font: string; size: number; align: 'left' | 'right'; maxLines: number; color: string },
): number {
  doc.font(opts.font).fontSize(opts.size).fillColor(opts.color);
  const lineH = opts.size * 1.28;
  const measure = (w: { text: string }) => doc.widthOfString(w.text);
  const space = () => doc.widthOfString(' ');

  const lines = layoutMixedText(measure, space, text, width).slice(0, opts.maxLines);

  lines.forEach((logical, row) => {
    const visual = opts.align === 'right' ? rtlVisualOrder(logical) : reverseArabicRuns(logical);
    const lineW =
      visual.reduce((sum, w) => sum + measure(w), 0) + space() * Math.max(0, visual.length - 1);
    let cursor = opts.align === 'right' ? x + width - lineW : x;

    visual.forEach((word, i) => {
      doc.text(word.text, cursor, y + row * lineH, { lineBreak: false });
      cursor += measure(word) + (i < visual.length - 1 ? space() : 0);
    });
  });

  return lines.length * lineH;
}

function drawCutLines(doc: PDFKit.PDFDocument) {
  doc.save().lineWidth(0.5).strokeColor(CUT_LINE).dash(3, { space: 3 });
  for (let c = 1; c < COLUMNS; c++) doc.moveTo(c * CELL_W, 0).lineTo(c * CELL_W, PAGE_H).stroke();
  for (let r = 1; r < ROWS; r++) doc.moveTo(0, r * CELL_H).lineTo(PAGE_W, r * CELL_H).stroke();
  doc.undash().restore();
}

function drawTicket(doc: PDFKit.PDFDocument, p: TicketProduct, left: number, top: number) {
  const price = ticketPrice(p);
  if (!price) throw new Error(`${p.code} has no selling price`);

  const x = left + PAD;
  const w = CELL_W - PAD * 2;
  const bottom = top + CELL_H - PAD;

  // ── Header: the mark, and the code for whoever restocks the shelf ──
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, x, top + PAD - 2, { fit: [62, 34] });
  }
  doc.font(F.medium).fontSize(8).fillColor(MUTED);
  doc.text(p.code, x, top + PAD, { width: w, align: 'right', lineBreak: false });

  // ── The article, in both languages ──
  let y = top + PAD + 42;
  y += drawMixed(doc, p.name.fr, x, y, w, {
    font: F.bold,
    size: 13,
    align: 'left',
    maxLines: 2,
    color: BRAND.ink,
  });
  if (p.name.ar?.trim()) {
    y += 3;
    drawMixed(doc, p.name.ar, x, y, w, {
      font: F.medium,
      size: 11.5,
      align: 'right',
      maxLines: 2,
      color: BRAND.ink,
    });
  }

  // ── The price, set apart at the foot so it reads from a distance ──
  const priceSize = 30;
  const priceY = bottom - priceSize;
  doc
    .moveTo(x, priceY - (price.was !== undefined ? 24 : 12))
    .lineTo(x + w, priceY - (price.was !== undefined ? 24 : 12))
    .lineWidth(0.6)
    .strokeColor(BRAND.hairline)
    .stroke();

  if (price.was !== undefined) {
    // The old price, struck through, above the one that applies.
    const was = `${formatTicketPrice(price.was)} DT`;
    doc.font(F.medium).fontSize(11).fillColor(MUTED);
    const wasW = doc.widthOfString(was);
    doc.text(was, x, priceY - 17, { lineBreak: false });
    doc
      .moveTo(x, priceY - 11)
      .lineTo(x + wasW, priceY - 11)
      .lineWidth(1)
      .strokeColor(MUTED)
      .stroke();
  }

  const figure = formatTicketPrice(price.price);
  doc.font(F.black).fontSize(priceSize).fillColor(BRAND.teal);
  const figureW = doc.widthOfString(figure);
  doc.text(figure, x, priceY, { lineBreak: false });
  doc.font(F.bold).fontSize(13).fillColor(BRAND.teal);
  doc.text('DT', x + figureW + 5, priceY + priceSize - 19, { lineBreak: false });
  doc.font(F.medium).fontSize(7.5).fillColor(MUTED);
  doc.text('TTC', x + figureW + 6, priceY + priceSize - 6, { lineBreak: false });

  if (price.percent !== undefined) {
    // The palette's orange, as a tint behind ink: white on that orange is too
    // faint to read, and a reduction is the one thing that must be read.
    const tag = `-${price.percent} %`;
    doc.font(F.black).fontSize(14);
    const tagW = doc.widthOfString(tag) + 16;
    const tagX = x + w - tagW;
    const tagY = priceY + 4;
    doc.roundedRect(tagX, tagY, tagW, 24, 5).fill('#fde7d3');
    doc.fillColor('#8a3f08').text(tag, tagX + 8, tagY + 5, { lineBreak: false });
  }
}

/**
 * Renders the tickets, in the order given, each product's copies together.
 *
 * Throws on a product with no selling price rather than printing it: the
 * caller is expected to have refused it already, and this is the last line.
 */
export async function renderLabelsPdf(
  lines: { product: TicketProduct; copies: number }[],
): Promise<{ pdf: Buffer; tickets: number; pages: number }> {
  const tickets = lines.flatMap((l) => Array.from({ length: l.copies }, () => l.product));

  const doc = new PDFDocument({ size: 'A4', margin: 0, font: STATIONERY.FONTS.regular, autoFirstPage: true });
  registerStationeryFonts(doc);

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  tickets.forEach((product, i) => {
    const slot = i % TICKETS_PER_PAGE;
    if (slot === 0) {
      if (i > 0) doc.addPage();
      drawCutLines(doc);
    }
    const col = slot % COLUMNS;
    const row = Math.floor(slot / COLUMNS);
    drawTicket(doc, product, col * CELL_W, row * CELL_H);
  });

  doc.end();
  return { pdf: await done, tickets: tickets.length, pages: pagesFor(tickets.length) };
}
