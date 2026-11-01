import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import { STATIONERY, registerStationeryFonts, reverseArabicRuns } from '@libs/invoice';
import { rtlVisualOrder } from '@libs/labels';
import { shapeArabic } from '@libs/arabic-shaper';
import { fr3, type InvestorReport } from './compute';

/**
 * The investor report as an A4 PDF.
 *
 * Drawn the way the invoices are drawn — the shop's fonts, mark and blue — so
 * it reads as the shop's own paper. Tables carry their header onto every page
 * they continue on, and every page is numbered once the whole document is laid
 * out, so the count is right.
 */

const { F, LOGO_PATH } = STATIONERY;

const W = 595.28;
const L = 40;
const R = W - 40;
const CW = R - L;
const TOP = 46;
const BOTTOM = 788;

const C = {
  ink: '#13202b', ink2: '#485664', ink3: '#75828f', line: '#dde3e9', line2: '#eef2f5',
  accent: '#2b79af', panel: '#f4f7fa', warn: '#9a5800', warnSoft: '#fdf3e2', bad: '#b42318', good: '#1f7a4a',
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a',
};

const NB = ' ';
const f0 = (n: number) => `${n < -0.5 ? '−' : ''}${Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NB)}`;
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}${NB}%`;
const dfr = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');

/**
 * Arabic, readable.
 *
 * pdfkit draws characters left to right as given, so an Arabic name has to be
 * joined and put in visual order first — the same treatment the invoices give
 * a client's name. Latin text passes through untouched.
 */
function vis(text: string): string {
  if (!/[؀-ۿ]/.test(text)) return text;
  const words = text.split(/\s+/).filter(Boolean).map((w) =>
    /[؀-ۿ]/.test(w) ? { type: 'ar' as const, text: shapeArabic(w) } : { type: 'en' as const, text: w });
  const firstStrong = text.match(/[A-Za-z؀-ۿ]/)?.[0] ?? '';
  const ordered = /[؀-ۿ]/.test(firstStrong) ? rtlVisualOrder(words) : reverseArabicRuns(words);
  return ordered.map((w) => w.text).join(' ');
}

type Cell = string | { text: string; color?: string; bold?: boolean; size?: number };
type Col = { title: string; width: number; align?: 'left' | 'right' };

export async function renderInvestorReportPdf(rep: InvestorReport, opts: { businessName: string }): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4', margin: 0, bufferPages: true, font: STATIONERY.FONTS.regular,
    info: { Title: `Rapport aux investisseurs ${opts.businessName}, ${dfr(rep.generatedAt)}`, Author: opts.businessName },
  });
  registerStationeryFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  let y = TOP;
  const t = rep.totals;

  const font = (f: string, size: number, color = C.ink) => doc.font(f).fontSize(size).fillColor(color);
  const height = (text: string, f: string, size: number, width: number) => {
    doc.font(f).fontSize(size);
    return doc.heightOfString(vis(text), { width, lineGap: 1 });
  };
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };
  const para = (text: string, o: { size?: number; color?: string; f?: string; width?: number; gap?: number } = {}) => {
    const size = o.size ?? 9.2; const width = o.width ?? CW; const f = o.f ?? F.regular;
    const h = height(text, f, size, width);
    ensure(h);
    font(f, size, o.color ?? C.ink2).text(vis(text), L, y, { width, lineGap: 1 });
    y += h + (o.gap ?? 8);
  };
  const section = (eyebrow: string, title: string, lede?: string) => {
    // Never a heading alone at the foot of a page.
    ensure(90);
    y += 6;
    font(F.bold, 7.5, C.accent).text(eyebrow.toUpperCase(), L, y, { characterSpacing: 1.1, lineBreak: false });
    y += 13;
    font(F.black, 15, C.ink).text(title, L, y, { width: CW });
    y += height(title, F.black, 15, CW) + 6;
    if (lede) para(lede, { size: 9.4, gap: 10 });
  };
  const subhead = (title: string) => { ensure(60); font(F.bold, 10.5, C.ink).text(title, L, y); y += 17; };

  const table = (cols: Col[], rows: Cell[][], foot?: Cell[], size = 7.6) => {
    const total = cols.reduce((s, c) => s + c.width, 0);
    const widths = cols.map((c) => (c.width / total) * CW);
    const xs = widths.map((_, i) => L + widths.slice(0, i).reduce((s, w) => s + w, 0));
    const pad = 4;
    const cellText = (c: Cell) => (typeof c === 'string' ? c : c.text);
    const rowHeight = (row: Cell[], f: string) =>
      Math.max(...row.map((c, i) => height(cellText(c), f, typeof c === 'string' ? size : c.size ?? size, widths[i] - pad * 2))) + pad * 2;
    const headerHeight = Math.max(...cols.map((c, i) => {
      doc.font(F.bold).fontSize(6.3);
      return doc.heightOfString(c.title.toUpperCase(), { width: widths[i] - pad * 2, characterSpacing: 0.4 });
    })) + 12;
    const header = () => {
      const h = headerHeight;
      cols.forEach((c, i) => font(F.bold, 6.3, C.ink2).text(c.title.toUpperCase(), xs[i] + pad, y + 6,
        { width: widths[i] - pad * 2, align: c.align ?? 'left', characterSpacing: 0.4 }));
      doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.8).strokeColor(C.line).stroke();
      y += h;
    };
    const draw = (row: Cell[], f: string, rule: string, ruleWidth = 0.5, top = false) => {
      const h = rowHeight(row, f);
      if (y + h > BOTTOM) { newPage(); header(); }
      if (top) doc.moveTo(L, y).lineTo(R, y).lineWidth(1.2).strokeColor(C.line).stroke();
      row.forEach((c, i) => {
        const o: { color?: string; bold?: boolean; size?: number } = typeof c === 'string' ? {} : c;
        font(o.bold ? F.bold : f, o.size ?? size, o.color ?? C.ink).text(vis(cellText(c)), xs[i] + pad, y + pad,
          { width: widths[i] - pad * 2, align: cols[i].align ?? 'left', lineGap: 1 });
      });
      y += h;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(ruleWidth).strokeColor(rule).stroke();
    };
    ensure(headerHeight + rowHeight(rows[0] ?? foot ?? [''], F.regular) * Math.min(3, rows.length || 1));
    header();
    rows.forEach((row) => draw(row, F.regular, C.line2));
    if (foot) draw(foot.map((c) => (typeof c === 'string' ? { text: c, bold: true } : { ...c, bold: true })), F.bold, C.line, 0.8, true);
    y += 12;
  };

  // ── Header ─────────────────────────────────────────────────────────────
  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, R - 74, TOP - 8, { fit: [74, 48], align: 'right' });
  font(F.bold, 7.5, C.accent).text(`${opts.businessName} · Rapport aux investisseurs`.toUpperCase(), L, y, { characterSpacing: 1.1 });
  y += 15;
  font(F.black, 22, C.ink).text(`Situation au ${dfr(rep.generatedAt)}`, L, y, { width: CW - 90 });
  y += 30;
  para('Ce que sont devenus les fonds apportés : les marchandises achetées, ce qui a été vendu, l’argent encaissé et le stock qui reste, article par article.',
       { size: 9.8, width: CW - 90, gap: 8 });
  font(F.regular, 8.2, C.ink3).text(
    `Période : du ${dfr(rep.period.from)} au ${dfr(rep.period.to)}   ·   Première vente : ${rep.period.firstSale ? dfr(rep.period.firstSale) : '—'}   ·   Montants en dinars tunisiens`,
    L, y, { width: CW });
  y += 16;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.6).strokeColor(C.ink).stroke();
  y += 16;

  // ── Key figures ────────────────────────────────────────────────────────
  section('L’essentiel', 'Les chiffres clés');
  const tiles: [string, string, string][] = [
    ['Apport des investisseurs', t.investment > 0 ? `${f0(t.investment)} DT` : 'Non renseigné', 'Montant saisi dans les paramètres'],
    ['Achats de marchandises', `${f0(t.spent)} DT`, `${t.investment > 0 ? `${pct((t.spent / t.investment) * 100)} de l’apport · ` : ''}${t.unitsBought} articles`],
    ['Ventes', `${f0(t.revenue)} DT`, `${t.invoices} factures · ${t.unitsSold} articles vendus`],
    ['Marge brute', `${f0(t.margin)} DT`, t.revenue ? `${pct((t.margin / t.revenue) * 100)} des ventes` : '—'],
    ['Stock restant', `${f0(t.stockCost)} DT`, `${t.unitsOnHand} articles au prix d’achat · ${f0(t.stockPrice)} DT au prix affiché`],
    ['Trésorerie attendue', `${f0(t.cashEstimate)} DT`, `Avant charges non enregistrées · ${f0(t.receivable)} DT à encaisser`],
  ];
  const tw = CW / 3; const th = 64;
  ensure(th * 2);
  tiles.forEach(([label, value, sub], i) => {
    const x = L + (i % 3) * tw; const ty = y + Math.floor(i / 3) * th;
    doc.rect(x, ty, tw, th).lineWidth(0.6).strokeColor(C.line).stroke();
    font(F.bold, 7.6, C.ink2).text(label, x + 10, ty + 9, { width: tw - 20, lineBreak: false });
    font(F.black, 16, C.ink).text(value, x + 10, ty + 21, { width: tw - 20, lineBreak: false });
    font(F.regular, 7, C.ink3).text(sub, x + 10, ty + 42, { width: tw - 20, lineGap: 0.5 });
  });
  y += th * 2 + 16;

  // ── Where the money is ─────────────────────────────────────────────────
  section('L’apport', 'Où se trouve l’argent aujourd’hui',
    t.investment > 0 && t.spent > t.investment
      ? `Les achats dépassent l’apport de ${fr3(t.spent - t.investment)} DT, payés avec l’argent des ventes. Les ventes ont ensuite transformé une partie du stock en trésorerie, avec une marge.`
      : 'L’apport a servi à acheter des marchandises. Les ventes ont ensuite transformé une partie du stock en trésorerie, avec une marge.');
  const parts: [string, number, string][] = [
    ['Stock au prix d’achat', t.stockCost, C.s1], ['Trésorerie attendue', Math.max(0, t.cashEstimate), C.s2], ['À encaisser', t.receivable, C.s3],
  ];
  const whole = parts.reduce((s, p) => s + p[1], 0) || 1;
  ensure(20 + 3 * 15 + 10);
  let bx = L; const gap = 2; const avail = CW - gap * (parts.length - 1);
  parts.forEach(([label, v, color], i) => {
    const w = Math.max((avail * v) / whole, v > 0 ? 3 : 0);
    if (w <= 0) return;
    doc.save().rect(bx, y, w, 18).fill(color).restore();
    if (w > 110) font(F.bold, 7.8, '#ffffff').text(`${label.split(' au ')[0]} · ${f0(v)} DT`, bx + 7, y + 5, { lineBreak: false });
    bx += w + (i < parts.length - 1 ? gap : 0);
  });
  y += 26;
  parts.forEach(([label, v, color]) => {
    doc.save().roundedRect(L, y + 1.5, 8, 8, 1.5).fill(color).restore();
    font(F.regular, 8.6, C.ink).text(label, L + 15, y, { lineBreak: false });
    font(F.bold, 8.6, C.ink).text(`${fr3(v)} DT`, L + 230, y, { width: 120, align: 'right', lineBreak: false });
    font(F.regular, 8.6, C.ink3).text(pct((v / whole) * 100), L + 360, y, { width: 50, align: 'right', lineBreak: false });
    y += 14;
  });
  y += 10;

  const bridge = (x: number, w: number, title: string, rows: [string, string, string?][], total: [string, string], after?: [string, string, string?]) => {
    let by = y;
    font(F.bold, 9.6, C.ink).text(title, x, by); by += 18;
    for (const [label, value, color] of rows) {
      font(F.regular, 8.6, color ?? C.ink).text(label, x, by, { width: w - 90, lineBreak: false });
      font(F.bold, 8.6, color ?? C.ink).text(value, x + w - 110, by, { width: 110, align: 'right', lineBreak: false });
      by += 15; doc.moveTo(x, by - 3).lineTo(x + w, by - 3).lineWidth(0.4).strokeColor(C.line2).stroke();
    }
    doc.moveTo(x, by).lineTo(x + w, by).lineWidth(1.2).strokeColor(C.ink).stroke(); by += 5;
    font(F.bold, 8.8, C.ink).text(total[0], x, by, { lineBreak: false });
    font(F.bold, 8.8, C.ink).text(total[1], x + w - 110, by, { width: 110, align: 'right', lineBreak: false });
    by += 15;
    if (after) {
      font(F.regular, 8.6, after[2] ?? C.ink).text(after[0], x, by, { lineBreak: false });
      font(F.bold, 8.6, after[2] ?? C.ink).text(after[1], x + w - 110, by, { width: 110, align: 'right', lineBreak: false });
      by += 15;
    }
    return by;
  };
  ensure(130);
  const half = (CW - 24) / 2;
  const left = bridge(L, half, 'Mouvements de l’argent', [
    ['Apport des investisseurs', fr3(t.investment)],
    ['Achats de marchandises', fr3(-t.spent), C.bad],
    ['Encaissements des clients', `+${fr3(t.expectedIn)}`, C.good],
  ], ['Trésorerie attendue', fr3(t.cashEstimate)]);
  const right = bridge(L + half + 24, half, 'Ce que l’apport est devenu', [
    ['Stock, au prix d’achat', fr3(t.stockCost)],
    ['Trésorerie attendue', fr3(t.cashEstimate)],
    ['À encaisser', fr3(t.receivable)],
    ['Timbres fiscaux à reverser à l’État', fr3(-t.stamps), C.bad],
  ], ['Valeur au prix d’achat', fr3(t.position - t.stamps)],
     ['Par rapport à l’apport', `${t.gain >= 0 ? '+' : ''}${fr3(t.gain)}`, t.gain >= 0 ? C.good : C.bad]);
  y = Math.max(left, right) + 8;
  para(`Encaissements retenus : les ${t.invoices} ventes facturées (${fr3(t.invoiced)} DT), moins ce qui reste dû (${fr3(t.receivable)} DT). Les paiements enregistrés dans l’application totalisent ${fr3(t.recordedIn)} DT${Math.abs(t.recordedIn - t.expectedIn) > 0.0005 ? ` ; l’écart de ${fr3(t.recordedIn - t.expectedIn)} DT est expliqué dans les contrôles` : ''}.`, { size: 8.2 });

  const calloutText = `L’application suit le stock, les ventes et les encaissements. Elle n’enregistre ni le loyer, ni les salaires, ni le transport, ni l’électricité, ni l’aménagement du magasin. La trésorerie attendue de ${fr3(t.cashEstimate)} DT est donc un maximum : l’écart avec l’argent réellement en caisse et en banque correspond à ces charges.`;
  const ch = height(calloutText, F.regular, 8.6, CW - 26) + 30;
  ensure(ch);
  doc.save().rect(L, y, CW, ch).fill(C.warnSoft).rect(L, y, 3, ch).fill(C.warn).restore();
  font(F.bold, 8.8, C.ink).text('Charges non comprises', L + 14, y + 9);
  font(F.regular, 8.6, C.ink).text(calloutText, L + 14, y + 23, { width: CW - 26, lineGap: 1 });
  y += ch + 14;

  // ── Purchases ──────────────────────────────────────────────────────────
  newPage();
  section('Achats', `${fr3(t.spent)} DT de marchandises`,
    'Chaque article est compté au prix d’achat enregistré dans l’application, pour toutes les unités entrées : imports de factures fournisseurs, stock de départ et corrections manuelles.');
  table([{ title: 'Famille', width: 3 }, { title: 'Références', width: 1, align: 'right' }, { title: 'Articles', width: 1, align: 'right' },
         { title: 'Montant', width: 1.6, align: 'right' }, { title: 'Part de l’apport', width: 1.4, align: 'right' }],
    rep.families.filter((f) => f.refs > 0).map((f) => [f.name, String(f.refs), String(f.unitsIn), fr3(f.spent),
      t.investment > 0 ? pct((f.spent / t.investment) * 100) : '—']),
    ['Total', String(rep.purchases.length), String(t.unitsBought), fr3(t.spent), t.investment > 0 ? pct((t.spent / t.investment) * 100) : '—'], 8);
  subhead('Détail des achats');
  table([{ title: 'Code', width: 1.5 }, { title: 'Article', width: 4.6 }, { title: 'Famille', width: 1.6 }, { title: 'Entrée', width: 1.2 },
         { title: 'Qté', width: 0.6, align: 'right' }, { title: 'Coût unit.', width: 1.3, align: 'right' }, { title: 'Total', width: 1.4, align: 'right' }],
    rep.purchases.map((x) => [{ text: x.code, size: 7 }, x.name, x.family, dfr(x.date), String(x.units), fr3(x.unitCost), fr3(x.total)]),
    ['', 'Total', '', '', String(t.unitsBought), '', fr3(t.spent)]);

  // ── Sales ──────────────────────────────────────────────────────────────
  newPage();
  section('Ventes', `${t.invoices} factures, ${fr3(t.revenue)} DT`,
    `Ventes classées à la date de facture. Les remises accordées au comptoir représentent ${fr3(t.discounts)} DT${t.listValue ? `, soit ${pct((t.discounts / t.listValue) * 100)} des prix affichés` : ''}. Le timbre fiscal de 1 DT par facture (${fr3(t.stamps)} DT) est collecté pour l’État et n’entre pas dans les ventes.`);
  if (rep.timeline.length) {
    subhead(rep.timeline.length > 1 && rep.timeline[0].label.includes(' ') && !rep.timeline[0].label.includes('–') ? 'Ventes par mois' : 'Ventes par semaine');
    const chH = 130; ensure(chH + 24);
    const vmax = Math.max(...rep.timeline.map((p) => p.revenue), 1);
    const step = Math.pow(10, Math.floor(Math.log10(vmax))) * (vmax / Math.pow(10, Math.floor(Math.log10(vmax))) > 5 ? 2 : 1);
    const top = Math.ceil(vmax / step) * step;
    const left0 = L + 44; const plotW = CW - 44; const base = y + chH;
    for (let v = 0; v <= top + 1e-9; v += step) {
      const gy = base - (chH - 14) * (v / top);
      doc.moveTo(left0, gy).lineTo(R, gy).lineWidth(0.4).strokeColor(C.line2).stroke();
      font(F.regular, 7, C.ink3).text(f0(v), L, gy - 4, { width: 38, align: 'right', lineBreak: false });
    }
    const band = plotW / rep.timeline.length; const colW = Math.min(24, band * 0.5);
    rep.timeline.forEach((p, i) => {
      const cx = left0 + band * i + band / 2; const h = (chH - 14) * (p.revenue / top);
      if (h > 0) doc.save().roundedRect(cx - colW / 2, base - h, colW, h, Math.min(3, h / 2)).fill(C.s1).restore();
      font(F.bold, 7.4, C.ink).text(`${f0(p.revenue)} DT`, cx - 50, base - h - 11, { width: 100, align: 'center', lineBreak: false });
      font(F.regular, 7, C.ink2).text(p.label, cx - 50, base + 5, { width: 100, align: 'center', lineBreak: false });
    });
    y = base + 22;
  }
  subhead('Marge par famille');
  table([{ title: 'Famille', width: 3 }, { title: 'Articles', width: 1, align: 'right' }, { title: 'Ventes', width: 1.5, align: 'right' },
         { title: 'Coût', width: 1.5, align: 'right' }, { title: 'Marge', width: 1.4, align: 'right' }, { title: 'Marge / ventes', width: 1.3, align: 'right' }],
    rep.families.filter((f) => f.revenue > 0).map((f) => [f.name, String(f.unitsSold), fr3(f.revenue), fr3(f.cogs), fr3(f.revenue - f.cogs),
      pct(((f.revenue - f.cogs) / f.revenue) * 100)]),
    ['Total', String(t.unitsSold), fr3(t.revenue), fr3(t.cogs), fr3(t.margin), t.revenue ? pct((t.margin / t.revenue) * 100) : '—'], 8);
  subhead('Toutes les ventes facturées');
  table([{ title: 'Fact.', width: 0.62 }, { title: 'Date', width: 1.32 }, { title: 'Cde', width: 0.6 }, { title: 'Client', width: 1.55 },
         { title: 'Article', width: 2.45 }, { title: 'Qté', width: 0.6, align: 'right' }, { title: 'Prix affiché', width: 1.25, align: 'right' },
         { title: 'Prix vendu', width: 1.25, align: 'right' }, { title: 'Remise', width: 1.2, align: 'right' }, { title: 'Coût', width: 1.28, align: 'right' },
         { title: 'Marge', width: 1.18, align: 'right' }],
    rep.saleLines.map((l) => [String(l.invoice).padStart(3, '0'), dfr(l.date), `#${l.order}`, l.client, l.name, String(l.qty), fr3(l.list),
      fr3(l.price), l.discount > 0.0005 ? fr3(l.discount) : '—', fr3(l.cost), { text: fr3(l.margin), color: l.margin < 0 ? C.bad : C.ink }]),
    ['', '', '', '', 'Total', String(t.unitsSold), fr3(t.listValue), fr3(t.revenue), fr3(t.discounts), fr3(t.cogs), fr3(t.margin)], 7.2);
  if (rep.excluded.length) {
    subhead('Commandes qui ne comptent pas comme ventes');
    table([{ title: 'Cde', width: 0.6 }, { title: 'Date', width: 1.1 }, { title: 'Client', width: 1.7 }, { title: 'Articles', width: 3.4 },
           { title: 'Montant', width: 1.2, align: 'right' }, { title: 'Situation', width: 2.6 }],
      rep.excluded.map((o) => [`#${o.order}`, dfr(o.date), o.client, o.items, fr3(o.total),
        o.status === 'pending' ? 'En attente : stock réservé, ni facturée ni payée'
          : o.creditNote ? `Annulée après la facture ${String(o.invoice).padStart(3, '0')}, avoir AV-${String(o.creditNote).padStart(3, '0')}` : 'Annulée avant facturation']));
  }

  // ── Money in ───────────────────────────────────────────────────────────
  section('Encaissements', `${fr3(t.expectedIn)} DT reçus des clients`,
    rep.owing.length ? `Reste à encaisser : ${rep.owing.map((o) => `${o.client} (${fr3(o.amount)} DT)`).join(', ')}.` : 'Aucun client ne doit d’argent.');
  table([{ title: 'Date', width: 1.1 }, { title: 'Client', width: 1.9 }, { title: 'Cde', width: 0.6 }, { title: 'Mode', width: 1 },
         { title: 'Montant', width: 1.2, align: 'right' }, { title: 'Remarque', width: 3.6 }],
    rep.paymentRows.map((p) => [dfr(p.date), p.client, p.order ? `#${p.order}` : '—',
      ({ cash: 'Espèces', check: 'Chèque', bank_transfer: 'Virement' } as Record<string, string>)[p.method] ?? p.method,
      fr3(p.amount), { text: p.flag, color: C.warn }]),
    ['', '', '', 'Total', fr3(t.recordedIn), '']);

  // ── Stock ──────────────────────────────────────────────────────────────
  newPage();
  const top1 = rep.stock[0];
  section('Stock', `${t.unitsOnHand} articles en magasin, ${fr3(t.stockCost)} DT`,
    top1 ? `${t.spent ? `${pct((t.stockCost / t.spent) * 100)} des marchandises achetées sont encore en stock. ` : ''}La référence la plus lourde, ${top1.name}, représente ${fr3(top1.valueCost)} DT (${top1.onHand} unités), soit ${pct((top1.valueCost / (t.stockCost || 1)) * 100)} du stock.` : undefined);
  const fam = rep.families.filter((f) => f.stockCost > 0);
  if (fam.length) {
    const fmax = Math.max(...fam.map((f) => f.stockCost));
    ensure(fam.length * 22 + 10);
    fam.forEach((f) => {
      font(F.regular, 8.4, C.ink2).text(f.name, L, y + 3, { width: 110, align: 'right', lineBreak: false });
      const w = ((CW - 220) * f.stockCost) / fmax;
      doc.save().roundedRect(L + 120, y, Math.max(w, 2), 14, 2.5).fill(C.s1).restore();
      font(F.bold, 8.4, C.ink).text(`${f0(f.stockCost)} DT`, L + 126 + w, y + 3, { lineBreak: false });
      y += 22;
    });
    y += 6;
  }
  table([{ title: 'Code', width: 1.5 }, { title: 'Article', width: 4.2 }, { title: 'Famille', width: 1.6 }, { title: 'Qté', width: 0.7, align: 'right' },
         { title: 'Coût unit.', width: 1.2, align: 'right' }, { title: 'Valeur au coût', width: 1.4, align: 'right' },
         { title: 'Prix affiché', width: 1.2, align: 'right' }, { title: 'Valeur au prix', width: 1.4, align: 'right' }],
    rep.stock.map((s) => [{ text: s.code, size: 7 }, s.name + (s.reserved ? ` (dont ${s.reserved} réservé)` : ''), s.family, String(s.onHand),
      fr3(s.unitCost), fr3(s.valueCost), fr3(s.price), fr3(s.valuePrice)]),
    ['', 'Total', '', String(t.unitsOnHand), '', fr3(t.stockCost), '', fr3(t.stockPrice)], 7.4);

  // ── Checks ─────────────────────────────────────────────────────────────
  section('Contrôles', 'Vérifications automatiques',
    'Ces contrôles sont refaits à chaque génération du rapport. Les chiffres ci-dessus en tiennent déjà compte.');
  rep.checks.forEach((c, i) => {
    const h = height(c.detail, F.regular, 8.4, CW - 40) + 26;
    ensure(h);
    doc.save().rect(L, y, CW, h).fill(c.ok ? '#eef7f1' : C.panel).restore();
    doc.save().circle(L + 15, y + 15, 7).fill(c.ok ? C.good : C.warn).restore();
    font(F.bold, 7.4, '#ffffff').text(c.ok ? 'OK' : String(i + 1 - rep.checks.filter((x, j) => j < i && x.ok).length), L + 8, y + 11.6,
      { width: 14, align: 'center', lineBreak: false });
    font(F.bold, 9, C.ink).text(c.title, L + 30, y + 8, { width: CW - 40 });
    font(F.regular, 8.4, C.ink2).text(vis(c.detail), L + 30, y + 21, { width: CW - 40, lineGap: 1 });
    y += h + 4;
  });

  // ── Appendix ───────────────────────────────────────────────────────────
  newPage();
  section('Annexe', 'Traçabilité du stock', 'Pour chaque article : ce qui est entré, ce qui est sorti et ce qui reste dans l’application. Puis chaque mouvement, dans l’ordre où il a été enregistré.');
  table([{ title: 'Code', width: 1.5 }, { title: 'Article', width: 4.4 }, { title: 'Entrées', width: 0.9, align: 'right' },
         { title: 'Corrections', width: 1.1, align: 'right' }, { title: 'Sorties', width: 0.9, align: 'right' }, { title: 'Retours', width: 0.9, align: 'right' },
         { title: 'Stock', width: 0.8, align: 'right' }, { title: 'Écart', width: 0.8, align: 'right' }],
    rep.reconciliation.map((r) => [{ text: r.code, size: 7 }, r.name, String(r.entered), r.corrected ? (r.corrected > 0 ? `+${r.corrected}` : String(r.corrected)) : '—',
      r.out ? String(r.out) : '—', r.back ? `+${r.back}` : '—', String(r.inApp),
      { text: r.gap ? String(r.gap) : '0', color: r.gap ? C.bad : C.good, bold: true }]), undefined, 7.2);
  subhead(`Journal des ${rep.movements.length} mouvements de stock`);
  const TYPE: Record<string, string> = { purchase: 'Achat (facture)', initial: 'Stock de départ', adjustment: 'Correction manuelle',
    sale: 'Vente', return: 'Retour', loss: 'Perte' };
  table([{ title: 'Date', width: 1.5 }, { title: 'Mouvement', width: 1.6 }, { title: 'Code', width: 1.5 }, { title: 'Qté', width: 0.6, align: 'right' },
         { title: 'Cde', width: 0.6 }, { title: 'Par', width: 1.1 }, { title: 'Motif', width: 3.6 }],
    rep.movements.map((m) => [`${dfr(m.date)} ${String(m.date).slice(11, 16)}`, TYPE[m.type] ?? m.type, { text: m.code, size: 6.8 },
      m.qty > 0 ? `+${m.qty}` : String(m.qty), m.order ? `#${m.order}` : '', m.by, m.reason]), undefined, 6.9);

  para('Source : base de données de l’application (articles, commandes, factures, avoirs, encaissements, mouvements de stock). Les montants sont valorisés au prix d’achat actuel de chaque article. L’apport des investisseurs est celui saisi dans les paramètres ; il n’est enregistré nulle part ailleurs dans l’application.',
       { size: 7.4, color: C.ink3 });

  // ── Page numbers, once the page count is known ─────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.moveTo(L, 806).lineTo(R, 806).lineWidth(0.4).strokeColor(C.line).stroke();
    font(F.regular, 7, C.ink3).text(`${opts.businessName} · Rapport aux investisseurs · ${dfr(rep.generatedAt)}`, L, 812, { lineBreak: false });
    font(F.regular, 7, C.ink3).text(`Page ${i + 1} / ${range.count}`, R - 80, 812, { width: 80, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
