import { getMailTransport, getSmtpConfig } from '@libs/email/smtp';
import type { RenderedEmail } from '@libs/email';
import type { EmailBranding } from '@libs/email';

type SendEmailInput = {
  /** One address, or several who all see each other on the message. */
  to: string | string[];
  email: RenderedEmail;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

export async function sendEmail({ to, email, attachments }: SendEmailInput) {
  const smtp = await getSmtpConfig();
  const transport = await getMailTransport();

  await transport.sendMail({
    from: `${smtp.fromName} <${smtp.fromEmail}>`,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments,
  });
}

export async function getDefaultEmailBranding(): Promise<EmailBranding> {
  const smtp = await getSmtpConfig();

  return Object.fromEntries(
    Object.entries({
      brandName: smtp.brandName ?? 'Dar El Khir',
      logoUrl: smtp.logoUrl,
      supportEmail: smtp.fromEmail,
      websiteUrl: smtp.websiteUrl,
      primaryColor: smtp.primaryColor,
      accentColor: smtp.accentColor,
      backgroundColor: smtp.backgroundColor,
    }).filter(([, value]) => value !== undefined && value !== ''),
  ) as EmailBranding;
}