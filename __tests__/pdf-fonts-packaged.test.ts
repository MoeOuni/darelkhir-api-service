import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

/**
 * Every function that renders a PDF has to ship the fonts.
 *
 * `package.individually` is on, so a Lambda contains only what its own entry
 * names. A function that draws an invoice without naming the fonts deploys
 * perfectly, typechecks, and passes every test — then answers the first person
 * who asks for a paper with
 *
 *   ENOENT: no such file or directory, open
 *   '/var/task/src/functions/declared/document/data/HealthySans-Regular.ttf'
 *
 * which is what the declared invoice did. Nothing catches it earlier because
 * the missing file is not code: it is an asset the bundler has no reason to
 * know about.
 *
 * So the two lists are pinned to each other here: whatever reaches the
 * renderer has to declare the assets it draws with.
 */
const ROOT = path.join(__dirname, '..');

/** The modules that open a font file. */
const RENDERERS = ['@libs/invoice', '@libs/declared-document'];

function readIfExists(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/**
 * Whether a handler reaches a renderer — directly, or through the use case
 * beside it, which is where this codebase puts the work.
 */
function drawsAPdf(handlerPath: string): boolean {
  const dir = path.dirname(path.join(ROOT, handlerPath));
  const sources = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readIfExists(path.join(dir, f)))
    .join('\n');

  return RENDERERS.some((mod) => sources.includes(mod));
}

function loadFunctions(file: string): Record<string, any> {
  const raw = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\$\{self:custom\.(\w+)\}/g, '$1')
    .replace(/\$\{[^}]*\}/g, 'X')
    // CloudFormation's own tags are not YAML that js-yaml knows; only the
    // handler names and package patterns matter here, so they are flattened.
    .replace(/!Ref\s+\S+/g, 'X')
    .replace(/![A-Za-z]+\s+\S+/g, 'X');
  return (yaml.load(raw) as Record<string, any>) ?? {};
}

/** Every function group the root config pulls in. */
const groups = fs
  .readFileSync(path.join(ROOT, 'serverless.yml'), 'utf8')
  .split('\n')
  .map((line) => line.match(/\$\{file\((src\/functions\/[^)]+serverless\.yml)\)\}/)?.[1])
  .filter((f): f is string => !!f);

describe('assets travel with the functions that draw them', () => {
  const rendering: [string, string, any][] = [];

  for (const group of groups) {
    for (const [name, definition] of Object.entries(loadFunctions(group))) {
      const handler = (definition as any)?.handler as string | undefined;
      if (!handler) continue;

      // "src/functions/x/y/endpoint.handler" -> "src/functions/x/y/endpoint.ts"
      const source = `${handler.replace(/\.[^.]+$/, '')}.ts`;
      if (!fs.existsSync(path.join(ROOT, source))) continue;

      if (drawsAPdf(source)) rendering.push([name, group, definition]);
    }
  }

  it('finds the functions that render', () => {
    // If this ever drops to zero the test below passes vacuously and guards
    // nothing, which is the one way a pinning test fails silently.
    expect(rendering.length).toBeGreaterThanOrEqual(2);
  });

  it.each(rendering.map(([name]) => name))('%s packages the fonts it draws with', (name) => {
    const [, , definition] = rendering.find(([n]) => n === name)!;
    const patterns: string[] = definition?.package?.patterns ?? [];

    expect(patterns.some((p) => p.endsWith('.ttf'))).toBe(true);
    expect(patterns.some((p) => p.endsWith('.png'))).toBe(true);
  });

  it('the fonts those patterns point at actually exist in the repository', () => {
    for (const [, , definition] of rendering) {
      for (const pattern of (definition?.package?.patterns ?? []) as string[]) {
        const dir = path.join(ROOT, path.dirname(pattern));
        const extension = path.extname(pattern);
        expect(fs.existsSync(dir)).toBe(true);
        expect(fs.readdirSync(dir).some((f) => f.endsWith(extension))).toBe(true);
      }
    }
  });
});
