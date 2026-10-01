import fs from 'node:fs';
import path from 'node:path';

/**
 * Stock never moves without the history saying why.
 *
 * `stockAvailable` is one number. When it is wrong, only the history explains
 * where the difference came from — so a path that changes the count and writes
 * nothing leaves a shelf that is right and a book that is silent.
 *
 * That is exactly how the credit note broke: cancelling an invoiced order put
 * the goods back and recorded nothing, so the journal showed the sale and no
 * return, and a worker reading it could not tell a cancelled order from a
 * miscount. It typechecked and every test passed.
 *
 * This walks the source instead of the behaviour, because the failure is an
 * absence: there is no call to assert on, only one that should have been made.
 */
const SRC = path.join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Files that change a product's stock, other than the repository itself. */
const movers = walk(SRC)
  .filter((file) => !file.endsWith(path.join('repositories', 'ProductRepository.ts')))
  .filter((file) => fs.readFileSync(file, 'utf8').includes('.updateStock('))
  .map((file) => path.relative(SRC, file));

describe('every path that moves stock', () => {
  it('there are some, so the check is not passing on an empty list', () => {
    expect(movers.length).toBeGreaterThan(0);
  });

  it.each(movers)('%s writes to the stock history too', (relative) => {
    const source = fs.readFileSync(path.join(SRC, relative), 'utf8');

    expect(source).toMatch(/recordStockMovements?\(/);
  });
});
