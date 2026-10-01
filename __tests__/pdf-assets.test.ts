import fs from 'node:fs';
import path from 'node:path';

/**
 * pdfkit is bundled into each handler by esbuild, and it resolves fonts from
 * `__dirname/data`. So a handler that renders a PDF has to sit in the same
 * folder the font files are packaged into, or it fails at runtime with an
 * ENOENT — which is exactly what happened once.
 *
 * The standard-font metrics are no longer shipped: the document names one of
 * our own fonts as its default, so pdfkit never reaches for Helvetica. The
 * first test below pins that, because dropping the option would bring back the
 * "ENOENT ... Helvetica.afm" crash and only in a deployed bundle.
 */

const ROOT = path.join(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'src/functions/orders/invoice/data');
const ORDERS_YML = path.join(ROOT, 'src/functions/orders/serverless.yml');

/** The four HealthySans weights the invoice is set in. */
const REQUIRED_TTF = [
  'HealthySans-Regular.ttf',
  'HealthySans-Medium.ttf',
  'HealthySans-Bold.ttf',
  'HealthySans-Black.ttf',
];

/** The mark, the two footer wings and the three contact icons. */
const REQUIRED_IMAGES = [
  'or-logo.png',
  'footer-left.png',
  'footer-right.png',
  'icon-location.png',
  'icon-phone.png',
  'icon-mail.png',
];

describe('PDF font assets', () => {
  it('names its own font as the document default', () => {
    // Without this, pdfkit loads Helvetica on construction and reads its
    // metrics from a .afm file we would then have to ship.
    const source = fs.readFileSync(path.join(ROOT, 'src/libs/invoice.ts'), 'utf8');
    expect(source).toMatch(/new PDFDocument\([\s\S]*?font: FONTS\.regular/);
    expect(fs.existsSync(path.join(ASSET_DIR, 'Helvetica.afm'))).toBe(false);
  });

  it('keeps the fonts pdfkit needs', () => {
    for (const file of [...REQUIRED_TTF, ...REQUIRED_IMAGES]) {
      expect(fs.existsSync(path.join(ASSET_DIR, file))).toBe(true);
    }
  });

  it('places every PDF handler in the folder the fonts are packaged into', () => {
    const yml = fs.readFileSync(ORDERS_YML, 'utf8');

    // Any function that packages the font files must also declare its handler
    // inside src/functions/orders/invoice/.
    const blocks = yml.split(/\n(?=\w)/);

    for (const block of blocks) {
      if (!block.includes('invoice/data/*.ttf')) continue;

      // Everything the renderer opens has to travel with the handler.
      expect(block).toContain('invoice/data/*.png');

      const handler = block.match(/handler:\s*(\S+)/)?.[1];
      expect(handler).toBeDefined();
      expect(handler!.startsWith('src/functions/orders/invoice/')).toBe(true);
    }
  });

  it('does not declare a PDF handler outside that folder', () => {
    const yml = fs.readFileSync(ORDERS_YML, 'utf8');
    // The document endpoint was once at orders/document/ and broke on deploy.
    expect(yml).not.toContain('src/functions/orders/document/endpoint.handler');
  });
});
