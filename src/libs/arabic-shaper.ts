/**
 * Joining Arabic letters by hand.
 *
 * Arabic letters change shape depending on their neighbours. A font normally
 * carries that logic in an OpenType `GSUB` table and the renderer applies it.
 * HealthySans has no GSUB at all, but it does carry the pre-joined shapes in
 * the Arabic Presentation Forms-B block (U+FE70–U+FEFF). So the joining is
 * worked out here and the already-joined characters are handed to the renderer.
 *
 * The output is also reversed, because the caller draws left to right while
 * Arabic reads right to left.
 */

/** isolated, final, initial, medial. A missing form means the letter has none. */
type Forms = [number, number?, number?, number?];

const FORMS: Record<string, Forms> = {
  'ء': [0xfe80],                                     // ء
  'آ': [0xfe81, 0xfe82],                             // آ
  'أ': [0xfe83, 0xfe84],                             // أ
  'ؤ': [0xfe85, 0xfe86],                             // ؤ
  'إ': [0xfe87, 0xfe88],                             // إ
  'ئ': [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],             // ئ
  'ا': [0xfe8d, 0xfe8e],                             // ا
  'ب': [0xfe8f, 0xfe90, 0xfe91, 0xfe92],             // ب
  'ة': [0xfe93, 0xfe94],                             // ة
  'ت': [0xfe95, 0xfe96, 0xfe97, 0xfe98],             // ت
  'ث': [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],             // ث
  'ج': [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],             // ج
  'ح': [0xfea1, 0xfea2, 0xfea3, 0xfea4],             // ح
  'خ': [0xfea5, 0xfea6, 0xfea7, 0xfea8],             // خ
  'د': [0xfea9, 0xfeaa],                             // د
  'ذ': [0xfeab, 0xfeac],                             // ذ
  'ر': [0xfead, 0xfeae],                             // ر
  'ز': [0xfeaf, 0xfeb0],                             // ز
  'س': [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],             // س
  'ش': [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],             // ش
  'ص': [0xfeb9, 0xfeba, 0xfebb, 0xfebc],             // ص
  'ض': [0xfebd, 0xfebe, 0xfebf, 0xfec0],             // ض
  'ط': [0xfec1, 0xfec2, 0xfec3, 0xfec4],             // ط
  'ظ': [0xfec5, 0xfec6, 0xfec7, 0xfec8],             // ظ
  'ع': [0xfec9, 0xfeca, 0xfecb, 0xfecc],             // ع
  'غ': [0xfecd, 0xfece, 0xfecf, 0xfed0],             // غ
  'ف': [0xfed1, 0xfed2, 0xfed3, 0xfed4],             // ف
  'ق': [0xfed5, 0xfed6, 0xfed7, 0xfed8],             // ق
  'ك': [0xfed9, 0xfeda, 0xfedb, 0xfedc],             // ك
  'ل': [0xfedd, 0xfede, 0xfedf, 0xfee0],             // ل
  'م': [0xfee1, 0xfee2, 0xfee3, 0xfee4],             // م
  'ن': [0xfee5, 0xfee6, 0xfee7, 0xfee8],             // ن
  'ه': [0xfee9, 0xfeea, 0xfeeb, 0xfeec],             // ه
  'و': [0xfeed, 0xfeee],                             // و
  'ى': [0xfeef, 0xfef0],                             // ى
  'ي': [0xfef1, 0xfef2, 0xfef3, 0xfef4],             // ي
};

/** Lam followed by one of these becomes a single ligature: [isolated, final]. */
const LAM_ALEF: Record<string, [number, number]> = {
  'آ': [0xfef5, 0xfef6], // لآ
  'أ': [0xfef7, 0xfef8], // لأ
  'إ': [0xfef9, 0xfefa], // لإ
  'ا': [0xfefb, 0xfefc], // لا
};

/** Marks sit above or below and never break a join. */
function isTransparent(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed);
}

/** A letter that connects to the one after it. */
function joinsForward(ch: string): boolean {
  const forms = FORMS[ch];
  return !!forms && forms[2] !== undefined;
}

/** A letter that connects to the one before it. */
function joinsBackward(ch: string): boolean {
  const forms = FORMS[ch];
  return !!forms && forms[1] !== undefined;
}

export function isArabicLetter(ch: string): boolean {
  return ch in FORMS;
}

/**
 * Joins one run of Arabic text and returns it in the order it must be drawn.
 *
 * Give it text in reading order; it hands back presentation forms reversed, so
 * drawing them left to right shows the word the right way round.
 */
export function shapeArabic(text: string): string {
  // Nothing to join and nothing to turn round. Without this guard a Latin
  // phrase would come back with its words in reverse.
  if (![...text].some(isArabicLetter)) return text;

  const chars = [...text];
  /** Each entry is one drawn unit; Latin and digit runs stay whole. */
  const out: string[] = [];

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];

    if (isTransparent(ch)) {
      out.push(ch);
      continue;
    }

    // Look past any marks for the real neighbours.
    let p = i - 1;
    while (p >= 0 && isTransparent(chars[p])) p -= 1;
    let n = i + 1;
    while (n < chars.length && isTransparent(chars[n])) n += 1;

    const prev = p >= 0 ? chars[p] : '';
    const next = n < chars.length ? chars[n] : '';

    // Lam + Alef is written as one letter, not two.
    if (ch === 'ل' && LAM_ALEF[next]) {
      const [iso, fin] = LAM_ALEF[next];
      out.push(String.fromCharCode(joinsForward(prev) ? fin : iso));
      i = n; // the alef is consumed by the ligature
      continue;
    }

    const forms = FORMS[ch];
    if (!forms) {
      out.push(ch);
      continue;
    }

    const linkBefore = joinsForward(prev);
    const linkAfter = joinsBackward(next);

    let code: number;
    if (linkBefore && linkAfter && forms[3] !== undefined) code = forms[3];
    else if (linkBefore && forms[1] !== undefined) code = forms[1];
    else if (linkAfter && forms[2] !== undefined) code = forms[2];
    else code = forms[0];

    out.push(String.fromCharCode(code));
  }

  // Drawn left to right, so the last letter of the word must come first.
  //
  // A number or a Latin word inside Arabic text still reads left to right —
  // "1220" must not become "0221" — so those runs are put back the way round
  // they came after the reversal.
  const reversed = out.reverse();
  const result: string[] = [];

  for (let i = 0; i < reversed.length; i += 1) {
    if (isArabicOutput(reversed[i])) {
      result.push(reversed[i]);
      continue;
    }

    // Take the whole non-Arabic stretch, spaces and all. A phone number
    // written "+216 20 00 00 00" is one thing that reads left to right, and
    // splitting it at every space would print its groups backwards.
    let j = i;
    while (j < reversed.length && !isArabicOutput(reversed[j])) j += 1;

    // The spaces at either end separate this stretch from the Arabic around
    // it, so they stay where the reversal put them.
    let start = i;
    let end = j;
    while (start < end && /\s/.test(reversed[start])) {
      result.push(reversed[start]);
      start += 1;
    }
    const trailing: string[] = [];
    while (end > start && /\s/.test(reversed[end - 1])) {
      trailing.push(reversed[end - 1]);
      end -= 1;
    }

    result.push(...reversed.slice(start, end).reverse(), ...trailing);
    i = j - 1;
  }

  return result.join('');
}

/** True for anything the shaper produced or left as Arabic. */
function isArabicOutput(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x0600 && c <= 0x06ff) || (c >= 0xfe70 && c <= 0xfeff);
}
