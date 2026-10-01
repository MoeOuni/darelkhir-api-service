import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildDocumentKey } from '../src/libs/s3-invoice';
import type { DocumentKind } from '../src/libs/invoice';

/**
 * The document function may only write to the prefixes its policy names.
 *
 * Adding a kind of paper means adding a prefix, and forgetting the policy is
 * invisible everywhere it would be caught: it typechecks, it renders, every
 * test passes, and then the button returns "not authorized to perform:
 * s3:PutObject on .../bundles/dossier-004.pdf" on a deployed stack. Which is
 * what happened to the stop papers, the delivery notes and the bundle.
 *
 * So the two lists are pinned to each other here: every prefix the key builder
 * can produce has to appear in the policy.
 */
const ROOT = path.join(__dirname, '..');

/** Every kind of paper the endpoint can be asked for. */
const KINDS: DocumentKind[] = [
  'invoice',
  'proforma',
  'credit_note',
  'stop',
  'delivery_note',
  'bundle',
];

function loadFunctions(file: string): Record<string, any> {
  const raw = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\$\{self:custom\.(\w+)\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, 'X')
    .replace(/!Ref\s+\S+/g, 'X');
  return yaml.load(raw) as Record<string, any>;
}

describe('IAM for order documents', () => {
  const functions = loadFunctions('src/functions/orders/serverless.yml');
  const statements: any[] = functions.getOrderDocument?.iamRoleStatements ?? [];

  /** The `foo` of every `bucket/foo/*` this function may write. */
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];

  const allowed = statements
    .filter((s) => list(s.Action).includes('s3:PutObject'))
    .flatMap((s) => list(s.Resource))
    .map((arn) => arn.split('/')[1])
    .filter(Boolean)
    .map((prefix) => prefix.replace(/\*$/, ''));

  it('has an S3 write statement at all', () => {
    expect(allowed.length).toBeGreaterThan(0);
  });

  it.each(KINDS)('allows writing a %s', (kind) => {
    // A stop paper and a per-drop delivery note are numbered from the drop.
    const key = buildDocumentKey(kind, 4, kind === 'stop' ? 1 : undefined);

    expect(allowed).toContain(key.split('/')[0]);
  });

  it('covers a delivery note for the whole order as well as for one drop', () => {
    for (const stopIndex of [undefined, 2]) {
      const key = buildDocumentKey('delivery_note', 4, stopIndex);
      expect(allowed).toContain(key.split('/')[0]);
    }
  });
});
