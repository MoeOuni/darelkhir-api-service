import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/**
 * Anything that recomputes a client balance has to be able to read what the
 * balance is made of.
 *
 * `recalculateClientBalance` queries every order and every payment for the
 * client and writes the total back onto him. A function that calls it without
 * those permissions typechecks, passes every test, and then fails in
 * production with "not authorized to perform: dynamodb:Query" — which is
 * exactly how the agreed-prices lookup and the document prefixes both broke.
 */
const ROOT = path.join(__dirname, '..');

/** Function name in its serverless.yml, and the file whose use case recomputes. */
const RECALCULATES: { file: string; fn: string }[] = [
  { file: 'src/functions/payments/serverless.yml', fn: 'createPayment' },
  { file: 'src/functions/payments/serverless.yml', fn: 'reversePayment' },
  // Setting the debt carried over from the notebook moves the balance too.
  { file: 'src/functions/clients/serverless.yml', fn: 'updateClient' },
  // Confirming an order is what turns it into a debt, and cancelling one takes
  // it back off — both recompute the balance now, not only the paths where
  // money changed hands.
  { file: 'src/functions/orders/serverless.yml', fn: 'updateOrder' },
  { file: 'src/functions/orders/serverless.yml', fn: 'createCreditNote' },
];

function loadFunctions(file: string): Record<string, any> {
  const raw = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\$\{self:custom\.(\w+)\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, 'X')
    .replace(/!Ref\s+\S+/g, 'X');
  return yaml.load(raw) as Record<string, any>;
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];

describe('IAM for whoever recomputes a balance', () => {
  it.each(RECALCULATES)('$fn can read the orders and the payments', ({ file, fn }) => {
    const definition = loadFunctions(file)[fn];
    expect(definition).toBeDefined();

    const statements: any[] = definition.iamRoleStatements ?? [];

    /** Every table this function may Query, by the custom name in the ARN. */
    const queryable = statements
      .filter((s) => list(s.Action).includes('dynamodb:Query'))
      .flatMap((s) => list(s.Resource))
      .map((arn) => arn.split('/')[1])
      .filter(Boolean);

    expect(queryable).toContain('ordersTableName');
    expect(queryable).toContain('paymentsTableName');
  });
});
