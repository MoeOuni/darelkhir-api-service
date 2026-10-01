import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getJsonSecret } from '@libs/secrets';

const SmtpSecretSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  secure: z.union([z.boolean(), z.string()]).transform((value) => {
    if (typeof value === 'boolean') return value;
    return value.toLowerCase() === 'true';
  }),
  user: z.string().min(1),
  pass: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  logoUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  brandName: z.string().min(1).optional(),
  primaryColor: z.string().min(1).optional(),
  accentColor: z.string().min(1).optional(),
  backgroundColor: z.string().min(1).optional(),
});

export type SmtpConfig = z.infer<typeof SmtpSecretSchema>;

type RawSecret = Record<string, unknown>;

let smtpConfigPromise: Promise<SmtpConfig> | null = null;
let transportPromise: Promise<nodemailer.Transporter> | null = null;

function normalizeSecretKeys(secret: RawSecret): RawSecret {
  return {
    host: secret.host ?? secret.HOST,
    port: secret.port ?? secret.PORT,
    secure: secret.secure ?? secret.SECURE,
    user: secret.user ?? secret.USER,
    pass: secret.pass ?? secret.PASS,
    fromEmail: secret.fromEmail ?? secret.FROM_EMAIL,
    fromName: secret.fromName ?? secret.FROM_NAME,
    logoUrl: secret.logoUrl ?? secret.LOGO_URL,
    websiteUrl: secret.websiteUrl ?? secret.WEBSITE_URL,
    brandName: secret.brandName ?? secret.BRAND_NAME,
    primaryColor: secret.primaryColor ?? secret.PRIMARY_COLOR,
    accentColor: secret.accentColor ?? secret.ACCENT_COLOR,
    backgroundColor: secret.backgroundColor ?? secret.BACKGROUND_COLOR,
  };
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  if (!smtpConfigPromise) {
    smtpConfigPromise = (async () => {
      const secretName = process.env.GMAIL_SMTP_SECRET_NAME;
      if (!secretName) {
        throw new Error('GMAIL_SMTP_SECRET_NAME is not configured');
      }

      const secret = await getJsonSecret<RawSecret>(secretName);
      return SmtpSecretSchema.parse(normalizeSecretKeys(secret));
    })();
  }

  return smtpConfigPromise;
}

export async function getMailTransport() {
  if (!transportPromise) {
    transportPromise = (async () => {
      const smtp = await getSmtpConfig();
      return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });
    })();
  }

  return transportPromise;
}