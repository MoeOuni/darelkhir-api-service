import { buildClientSearchKey, normaliseForSearch } from '@libs/search-key';

/**
 * Finding a client by whatever the person at the counter remembers.
 *
 * A single `contains` over the whole phrase used to back this, so anything but
 * the exact run of letters found nothing: "salhi abd" missed "Abd Elkhalk
 * Salhi", and so did the number as it is said out loud.
 */
const salhi = buildClientSearchKey({
  fullName: 'Abd Elkhalk Salhi',
  phone: '+21697285520',
  cin: '12697042',
  addresses: [{ street: 'Feriana' }],
});

const matches = (key: string, query: string) => {
  const haystack = normaliseForSearch(key);
  return normaliseForSearch(query)
    .split(' ')
    .filter(Boolean)
    .every((term) => haystack.includes(term));
};

describe('finding a client', () => {
  it.each([
    ['the whole name', 'Abd Elkhalk Salhi'],
    ['the family name alone', 'salhi'],
    ['two words out of order', 'salhi abd'],
    ['words that are not adjacent', 'abd salhi'],
    ['the number as it is said', '97285520'],
    ['the number as it is stored', '+21697285520'],
    ['the card number', '12697042'],
    ['the town he is in', 'feriana'],
    ['a name typed without its accents', 'ABD ELKHALK SALHI'],
  ])('finds him by %s', (_what, query) => {
    expect(matches(salhi, query)).toBe(true);
  });

  it('does not find someone else', () => {
    expect(matches(salhi, 'khmiri')).toBe(false);
  });

  it('needs every word to match, not just one', () => {
    expect(matches(salhi, 'salhi khmiri')).toBe(false);
  });

  /** "Béchir" is typed "bechir" on a phone. */
  it('ignores accents on both sides', () => {
    const bechir = buildClientSearchKey({ fullName: 'Béchir Gharbi' });
    expect(matches(bechir, 'bechir')).toBe(true);
    expect(matches(bechir, 'Béchir')).toBe(true);
  });
});
