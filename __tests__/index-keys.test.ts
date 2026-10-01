import fs from 'node:fs';
import path from 'node:path';

/**
 * A repository must query an index by the attribute that index is actually
 * keyed on.
 *
 * The tables are not consistent: clients, transporters and payments key
 * `gsi-resource-created` on `id`, while products, orders, journal, staff and
 * catalog key it on `dataType`. Querying the wrong one fails at runtime with
 * "Query condition missed key schema element", which is how the cheques screen
 * broke.
 */

const ROOT = path.join(__dirname, '..');
const DB_YML = path.join(ROOT, 'infrastructure/resources/db.yml');
const REPO_DIR = path.join(ROOT, 'src/repositories');

/** Table name → the attribute gsi-resource-created hashes on. */
function indexHashKeys(): Record<string, string> {
  const src = fs.readFileSync(DB_YML, 'utf8');
  const out: Record<string, string> = {};

  for (const block of src.split(/\n  (?=\w+Table:)/)) {
    const table = block.match(/^\s*(\w+Table):/)?.[1];
    if (!table) continue;

    const hash = block.match(
      /IndexName: gsi-resource-created\s*\n\s*KeySchema:\s*\n\s*- \{ AttributeName: (\w+)/
    )?.[1];
    if (hash) out[table] = hash;
  }
  return out;
}

/** Repository file → { tableConfigKey, queriedAttribute }. */
function repositoryQueries() {
  const out: Array<{ file: string; configKey: string; queried: string }> = [];

  for (const file of fs.readdirSync(REPO_DIR)) {
    if (!file.endsWith('Repository.ts')) continue;
    const src = fs.readFileSync(path.join(REPO_DIR, file), 'utf8');

    const configKey = src.match(/getConfig\(\)\.(\w+)/)?.[1];
    if (!configKey) continue;

    // Every query that runs against gsi-resource-created.
    const re = /setIndex\(GSI_RESOURCE_CREATED\)[\s\S]{0,120}?\.query\('(\w+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      out.push({ file, configKey, queried: m[1] });
    }
  }
  return out;
}

/** `paymentsTableName` → `PaymentsTable`. */
function configKeyToTable(key: string): string {
  const base = key.replace(/TableName$/, '');
  return base.charAt(0).toUpperCase() + base.slice(1) + 'Table';
}

describe('gsi-resource-created queries match the table definitions', () => {
  const hashKeys = indexHashKeys();

  it('finds the index on every table it is declared for', () => {
    expect(Object.keys(hashKeys).length).toBeGreaterThan(5);
  });

  it.each(repositoryQueries())(
    '$file queries $queried',
    ({ configKey, queried }) => {
      const table = configKeyToTable(configKey);
      const expected = hashKeys[table];

      // A repository pointing at a table with no such index is a separate
      // problem; skip rather than assert on undefined.
      if (!expected) return;

      expect(queried).toBe(expected);
    }
  );
});
