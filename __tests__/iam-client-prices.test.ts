import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/**
 * A function that reads a client's agreed prices needs `dynamodb:Query` on the
 * clients table, not just `GetItem` — the prices are a range of sort keys under
 * one partition, so they are queried, not fetched one by one.
 *
 * This is pinned because the failure is invisible until runtime and only on a
 * deployed stack: everything typechecks, every test passes, and then creating
 * an order returns "not authorized to perform: dynamodb:Query". Which is
 * exactly what happened.
 */
const ROOT = path.join(__dirname, '..');

/** Functions whose use case resolves a client's agreed prices. */
const NEEDS_QUERY = ['createOrder', 'updateOrder'];

function loadFunctions(file: string): Record<string, any> {
  const raw = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\$\{self:custom\.(\w+)\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, 'X')
    .replace(/!Ref\s+\S+/g, 'X');
  return yaml.load(raw) as Record<string, any>;
}

describe('IAM for agreed prices', () => {
  const functions = loadFunctions('src/functions/orders/serverless.yml');

  it.each(NEEDS_QUERY)('lets %s query the clients table', (name) => {
    const statements = functions[name]?.iamRoleStatements ?? [];
    const onClients = statements.filter((s: any) =>
      JSON.stringify(s.Resource ?? '').includes('clientsTableName'),
    );

    expect(onClients.length).toBeGreaterThan(0);
    const actions = onClients.flatMap((s: any) => s.Action);
    expect(actions).toContain('dynamodb:Query');
  });

  it('keeps the use cases that made this necessary', () => {
    // If neither reads prices any more the rule above is dead weight, and
    // somebody should delete it deliberately rather than wonder what it is for.
    const create = fs.readFileSync(
      path.join(ROOT, 'src/functions/orders/create/useCase.ts'),
      'utf8',
    );
    const update = fs.readFileSync(
      path.join(ROOT, 'src/functions/orders/update/useCase.ts'),
      'utf8',
    );
    expect(create).toContain('ClientPriceRepository');
    expect(update).toContain('ClientPriceRepository');
  });
});
