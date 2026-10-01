/**
 * Phone numbers as sign-in identifiers.
 *
 * Both Cognito pools were created with `UsernameAttributes: email`, and that
 * cannot be changed on an existing pool. Recreating them would drop every
 * account, and client records are keyed by the Cognito `sub`, so the link
 * between a client and their orders would break too.
 *
 * Instead the sign-in endpoints take a phone number, look up which account
 * carries it, and authenticate with that account's real username. Users type a
 * phone number; Cognito never sees one as a username.
 */

/** Tunisia. Used when a worker types a local number with no country code. */
const DEFAULT_COUNTRY_CODE = '+216';
const LOCAL_NUMBER_LENGTH = 8;

/** True when the text looks like an email address rather than a phone number. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}

/**
 * Converts what a worker typed into the E.164 form Cognito stores.
 *
 * Accepts `20 00 00 00`, `20000000`, `+216 20 00 00 00` and `0021620000000`.
 * Returns null when the text cannot be read as a phone number.
 */
/**
 * Arabic-Indic digits written as ASCII ones.
 *
 * A keyboard set to Arabic types ٢٤ where a French one types 24, and `\d` in a
 * JavaScript regular expression matches neither of those characters — it is
 * ASCII 0-9 and nothing else. Without this the digits are not rejected but
 * erased, stripped as though they were punctuation, and a number typed
 * correctly comes back as no number at all.
 *
 * Both ranges: U+0660 is the Arabic block, U+06F0 the Persian one some
 * keyboards emit instead.
 */
export function toAsciiDigits(input: string): string {
  return (input ?? '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const code = ch.codePointAt(0) as number;
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

export function normalizePhone(input: string): string | null {
  const trimmed = toAsciiDigits(input ?? '').trim();
  if (!trimmed) return null;

  // Keep digits and a leading plus only.
  let cleaned = trimmed.replace(/[^\d+]/g, '');

  // 00 is the international prefix in Tunisia and much of Europe.
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
  }

  // A bare local number gets the default country code.
  if (cleaned.length === LOCAL_NUMBER_LENGTH && /^\d+$/.test(cleaned)) {
    return `${DEFAULT_COUNTRY_CODE}${cleaned}`;
  }

  return null;
}
