import { normalizePhone, looksLikeEmail } from '@libs/phone';

/**
 * Sign-in resolves a phone number to an account. A number that normalizes
 * wrongly means a worker cannot get into the panel, so the parsing is pinned
 * here.
 */

describe('normalizePhone', () => {
  it('accepts a local Tunisian number and adds the country code', () => {
    expect(normalizePhone('20000000')).toBe('+21620000000');
  });

  it('ignores the spaces a worker types', () => {
    expect(normalizePhone('20 00 00 00')).toBe('+21620000000');
    expect(normalizePhone('+216 20 00 00 00')).toBe('+21620000000');
  });

  it('accepts the 00 international prefix', () => {
    expect(normalizePhone('0021620000000')).toBe('+21620000000');
  });

  it('keeps a number that is already in E.164 form', () => {
    expect(normalizePhone('+21620000000')).toBe('+21620000000');
  });

  it('strips dashes and dots', () => {
    expect(normalizePhone('20-00-00-00')).toBe('+21620000000');
    expect(normalizePhone('20.00.00.00')).toBe('+21620000000');
  });

  it('refuses a country code written without + or 00', () => {
    // '21620000000' could be a Tunisian number with its code, or a foreign
    // number entirely. Guessing would sign somebody into the wrong account, so
    // the country code has to be marked.
    expect(normalizePhone('(216) 20.00.00.00')).toBeNull();
    expect(normalizePhone('21620000000')).toBeNull();
  });

  it('accepts a foreign number with its own country code', () => {
    expect(normalizePhone('+33612345678')).toBe('+33612345678');
  });

  it('rejects text that is not a phone number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    // Too short to be a local number, and no country code.
    expect(normalizePhone('1234')).toBeNull();
    // Nine digits is not a Tunisian local number.
    expect(normalizePhone('200000005')).toBeNull();
  });

  it('rejects a country code starting with zero', () => {
    expect(normalizePhone('+021620000000')).toBeNull();
  });
});

describe('looksLikeEmail', () => {
  it('separates an email from a phone number', () => {
    expect(looksLikeEmail('admin@centergros.com')).toBe(true);
    expect(looksLikeEmail('+21620000000')).toBe(false);
    expect(looksLikeEmail('20000000')).toBe(false);
  });
});

/**
 * A number typed on an Arabic keyboard.
 *
 * `\d` is ASCII 0-9 and nothing else, so ٢٤ matched neither the digit class
 * nor the "keep only digits" filter — every character was stripped as
 * punctuation and a correctly typed number arrived as an empty string. The
 * shop's own phones are half in Arabic, so this is not an edge case here: it
 * is one worker who cannot sign in while everyone else can, with nothing on
 * screen to explain why.
 */
describe('numbers typed in Arabic', () => {
  it('reads Arabic-Indic digits', () => {
    expect(normalizePhone('٢٠٠٠٠٠٠٠')).toBe('+21620000000');
  });

  it('reads the Persian digits some keyboards send instead', () => {
    expect(normalizePhone('۲۰۰۰۰۰۰۰')).toBe('+21620000000');
  });

  it('reads a full international number in Arabic digits', () => {
    expect(normalizePhone('+٢١٦٢٠٠٠٠٠٠٠')).toBe('+21620000000');
  });

  it('reads the two scripts mixed, which is what a real keyboard produces', () => {
    expect(normalizePhone('٢٠ 00 ٠٠ 00')).toBe('+21620000000');
  });

  it('still refuses something that is not a number in either script', () => {
    expect(normalizePhone('٢٤')).toBeNull();
  });
});
