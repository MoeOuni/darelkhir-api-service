import { Context } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { getSettings } from '@libs/settings';
import { sendEmail } from '@libs/email/sender';
import { computeInvestorReport } from '@libs/investor-report/compute';
import { renderInvestorReportPdf } from '@libs/investor-report/pdf';
import { renderInvestorReportEmail } from '@libs/investor-report/email';
import { loadReportSource, tunisNow } from '@libs/investor-report/load';

/**
 * The investor report, built in the background and sent by email.
 *
 * One function in two roles. Called from the dashboard, it checks the caller
 * may see costs and margins, starts a second run of itself asynchronously and
 * answers straight away. That second run is not behind the API gateway's
 * thirty-second limit: it reads the whole history, draws the PDF and mails it.
 *
 * One function rather than two because the stack sits a few resources under
 * CloudFormation's limit of 500, and a second function would cost several.
 */

export const JOB = 'investor-report';
type Job = { job: typeof JOB; requestedBy?: string };

const lambda = new LambdaClient({});

export function isJob(event: unknown): event is Job {
  return !!event && typeof event === 'object' && (event as Job).job === JOB;
}

/** "DAR EL KHIR" as it is stored, "Dar El Khir" as it reads in a sentence. */
const displayName = (name: string) => name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export async function runInvestorReport(job: Job): Promise<{ recipients: string[]; pages: number; bytes: number }> {
  const settings = await getSettings();
  const recipients = settings.reportRecipients ?? [];
  if (!recipients.length) throw new Error('No recipient is configured for the investor report');

  const businessName = displayName(settings.businessName || 'Dar El Khir');
  const report = computeInvestorReport(await loadReportSource(settings.investorCapital ?? 0, tunisNow()));
  const pdf = await renderInvestorReportPdf(report, { businessName });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const asOf = report.generatedAt.slice(0, 10);

  await sendEmail({
    to: recipients,
    email: renderInvestorReportEmail(report, { businessName, requestedBy: job.requestedBy, pages }),
    attachments: [{ filename: `${businessName.replace(/\s+/g, '-')}-rapport-investisseurs-${asOf}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });

  console.log(JSON.stringify({ level: 'INFO', message: 'Investor report sent', recipients: recipients.length, pages, bytes: pdf.length }));
  return { recipients, pages, bytes: pdf.length };
}

export const startInvestorReport = async (event: ExtendedEvent, context: Context) => {
  const settings = await getSettings();
  const recipients = settings.reportRecipients ?? [];
  if (!recipients.length) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Aucun destinataire n’est défini pour le rapport. Ajoutez-en dans les paramètres.' }) };
  }

  await lambda.send(new InvokeCommand({
    FunctionName: context.functionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ job: JOB, requestedBy: event.user?.name } satisfies Job)),
  }));

  return { statusCode: 202, body: JSON.stringify({ message: 'Report on its way', data: { recipients } }) };
};

const http = middleware({
  // The report shows what the shop paid for everything, so it is held to the
  // same permission as the margins and costs in the reports screen.
  auth: true,
  cors: true,
  requires: 'reports.view_margin',
  audit: { action: 'report.investor_sent', entityType: 'report' },
})(startInvestorReport);

export const handler = async (event: any, context: Context) =>
  isJob(event) ? runInvestorReport(event) : http(event, context);
