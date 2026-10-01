import { shapeArabic } from '../src/libs/arabic-shaper';

const hex = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16)).join(' ');

/**
 * HealthySans carries no GSUB, so the joining is done here. If this breaks,
 * Arabic on the invoice comes out as a row of disconnected letters.
 */
describe('shapeArabic', () => {
  it('joins a word and reverses it for drawing', () => {
    // بيع : ب initial, ي medial, ع final — reversed for a left-to-right draw.
    expect(hex(shapeArabic('بيع'))).toBe('feca fef4 fe91');
  });

  it('leaves a lone letter isolated', () => {
    expect(hex(shapeArabic('ب'))).toBe('fe8f');
  });

  it('does not join after a letter that never connects forward', () => {
    // ر only joins backwards, so the ب after it stays initial, not medial.
    const out = shapeArabic('ربيع');
    expect(hex(out)).toBe('feca fef4 fe91 fead');
  });

  it('writes lam-alef as one ligature', () => {
    // لا is a single character, so two letters in gives one out.
    expect([...shapeArabic('لا')]).toHaveLength(1);
    expect(hex(shapeArabic('لا'))).toBe('fefb');
  });

  it('uses the joined lam-alef when something precedes it', () => {
    // بلا : the lam-alef takes its final form after the ب.
    expect(hex(shapeArabic('بلا'))).toBe('fefc fe91');
  });

  it('keeps marks with their letter', () => {
    const out = shapeArabic('بَ');
    expect(out).toContain('ً'.replace('ً', 'َ'));
  });

  it('leaves text with no Arabic in it alone', () => {
    expect(shapeArabic('AB 12')).toBe('AB 12');
  });

  it('keeps a number readable inside Arabic text', () => {
    // The postcode must stay 1220, not come out backwards as 0221.
    expect(shapeArabic('القصرين 1220')).toContain('1220');
  });

  it('keeps a Latin word readable inside Arabic text', () => {
    expect(shapeArabic('كود ABC')).toContain('ABC');
  });

  it('still puts the Latin run on the correct side', () => {
    // Reading right to left the number comes last, so drawn left to right it
    // lands first — before the Arabic, not after it.
    const out = shapeArabic('القصرين 1220');
    expect(out.trimStart().startsWith('1220')).toBe(true);
  });

  it('keeps the space between the number and the word', () => {
    expect(shapeArabic('القصرين 1220')).toMatch(/^1220\s/);
  });

  it('keeps a phone number in one piece', () => {
    // Split at every space, the groups would print backwards as "76 73 00 24".
    expect(shapeArabic('الهاتف : +216 20 00 00 00')).toContain('+216 20 00 00 00');
  });

  it('handles an empty string', () => {
    expect(shapeArabic('')).toBe('');
  });
});
