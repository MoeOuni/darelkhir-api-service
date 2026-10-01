/**
 * One way of writing a word, for matching against another.
 *
 * Lowercased, and with the accents taken off: a merchant types "bechir" and
 * "Béchir" has to come back, because nobody reaches for the accent keys on a
 * phone keyboard. Punctuation becomes a space so "d'amor" and "d amor" match,
 * and runs of whitespace collapse.
 */
export function normaliseForSearch(value: string): string {
  return value
    .normalize('NFD')
    // Strip the combining accents NFD just separated out.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .trim();
}

/**
 * The haystack stored on a record, holding every way someone might look for it.
 *
 * A phone is kept twice — as written and as the eight digits alone — because
 * "97285520" is how it is said out loud while "+21697285520" is how it is
 * stored.
 */
export function buildClientSearchKey(parts: {
  fullName?: string;
  email?: string;
  phone?: string;
  cin?: string;
  taxId?: string;
  addresses?: { street?: string }[];
}): string {
  const digits = (parts.phone ?? '').replace(/\D/g, '');
  const local = digits.replace(/^216/, '');

  return normaliseForSearch(
    [
      parts.fullName,
      parts.email,
      parts.phone,
      local,
      parts.cin,
      parts.taxId,
      ...(parts.addresses ?? []).map((a) => a?.street),
    ]
      .filter(Boolean)
      .join(' '),
  );
}
