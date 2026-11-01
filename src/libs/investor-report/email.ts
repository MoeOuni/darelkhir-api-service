import type { RenderedEmail } from '@libs/email';
import { fr3, type InvestorReport } from './compute';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dfr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * The message the report travels in.
 *
 * The headline figures are in the body so they can be read on a phone without
 * opening anything; the PDF carries the detail.
 */
export function renderInvestorReportEmail(rep: InvestorReport, o: { businessName: string; requestedBy?: string; pages: number }): RenderedEmail {
  const t = rep.totals;
  const open = rep.checks.filter((c) => !c.ok).length;
  const asOf = dfr(rep.generatedAt);
  const at = rep.generatedAt.slice(11, 16);
  const rows: [string, string][] = [
    ['Apport des investisseurs', `${fr3(t.investment)} DT`],
    ['Achats de marchandises', `${fr3(t.spent)} DT`],
    ['Ventes', `${fr3(t.revenue)} DT (${t.invoices} factures)`],
    ['Marge brute', `${fr3(t.margin)} DT`],
    ['Stock restant, au prix d’achat', `${fr3(t.stockCost)} DT (${t.unitsOnHand} articles)`],
    ['Trésorerie attendue', `${fr3(t.cashEstimate)} DT`],
    ['À encaisser', `${fr3(t.receivable)} DT`],
  ];
  const subject = `Rapport aux investisseurs ${o.businessName}, situation au ${asOf}`;
  const intro = `Voici la situation de ${o.businessName} au ${asOf} à ${at}${o.requestedBy ? `, demandée par ${o.requestedBy}` : ''}. Le rapport complet est en pièce jointe (PDF, ${o.pages} pages).`;
  const note = open
    ? `${open} point${open > 1 ? 's' : ''} à vérifier dans les données : voir la section « Contrôles » du rapport.`
    : 'Les contrôles automatiques n’ont relevé aucun écart.';
  const footer = 'La trésorerie attendue ne tient pas compte des charges non enregistrées dans l’application (loyer, salaires, transport…).';

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#13202b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#2b79af;font-weight:bold">${esc(o.businessName)}</p>
<h1 style="margin:0 0 12px;font-size:20px">Rapport aux investisseurs</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#485664">${esc(intro)}</p>
<table role="presentation" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #dde3e9;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #eef2f5;color:#485664">${esc(k)}</td><td style="padding:9px 12px;border-bottom:1px solid #eef2f5;text-align:right;font-weight:bold;white-space:nowrap">${esc(v)}</td></tr>`).join('')}
</table>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${open ? '#9a5800' : '#1f7a4a'}">${esc(note)}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#75828f">${esc(footer)}</p>
</div></body></html>`;
  const text = [`${o.businessName} · Rapport aux investisseurs`, '', intro, '', ...rows.map(([k, v]) => `${k} : ${v}`), '', note, footer].join('\n');
  return { subject, html, text } as RenderedEmail;
}
