import type { APIGatewayProxyEventHeaders } from 'aws-lambda';
import type { EmailLocale } from '@libs/email';

export function resolveEmailLocale(headers?: APIGatewayProxyEventHeaders | null): EmailLocale {
  const raw = headers?.['accept-language'] ?? headers?.['Accept-Language'] ?? '';
  const value = String(raw).toLowerCase();
  return value.startsWith('ar') ? 'ar' : 'fr';
}
