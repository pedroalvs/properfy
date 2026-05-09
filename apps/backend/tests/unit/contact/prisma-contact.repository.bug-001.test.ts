/**
 * BUG-001 (REV 4) — fail-fast unit guard for the `::text` cast.
 *
 * The deployed Supabase schema stores contact/appointment ids as Postgres
 * `text` (Prisma `String` without `@db.Uuid`). Earlier revisions of the
 * three contact aggregations cast bound parameters to `::uuid` / `::uuid[]`,
 * which crashed with `invalid input syntax for type uuid` against staging.
 *
 * The harness-backed integration test in
 * `tests/integration/db/contact-aggregation-types.integration.test.ts`
 * catches regressions end-to-end against real Postgres, but only runs when
 * Docker is available. This unit test reads the repository source and fails
 * fast if anyone reintroduces a `::uuid` cast in the three aggregations,
 * even when Docker is unavailable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_PATH = join(
  here,
  '..',
  '..',
  '..',
  'src',
  'modules',
  'contact',
  'infrastructure',
  'prisma-contact.repository.ts',
);

const SOURCE = readFileSync(REPO_PATH, 'utf8');

function extractMethod(name: string): string {
  const startMarker = `async ${name}(`;
  const start = SOURCE.indexOf(startMarker);
  if (start === -1) throw new Error(`Method ${name} not found`);
  // Find the matching closing brace by counting braces from the first `{`.
  const bodyStart = SOURCE.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < SOURCE.length; i += 1) {
    const ch = SOURCE[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find end of ${name}`);
}

/**
 * Strip TypeScript line + block comments before scanning so explanatory
 * comments referencing the historical `::uuid` bug don't trip the regex.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\/[^\n]*\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('BUG-001 guard — contact aggregations must use ::text casts', () => {
  it('countDistinctPropertiesByContactIds binds contactIds as ::text[]', () => {
    const body = withoutComments(extractMethod('countDistinctPropertiesByContactIds'));
    expect(body).toContain('::text[]');
    expect(body).not.toMatch(/::uuid/);
  });

  it('findPropertiesByContactId casts contactId as ::text', () => {
    const body = withoutComments(extractMethod('findPropertiesByContactId'));
    expect(body).toMatch(/contact_id = \$\{contactId\}::text\b/);
    expect(body).not.toMatch(/::uuid/);
  });

  it('countPropertiesByContactId casts contactId as ::text', () => {
    const body = withoutComments(extractMethod('countPropertiesByContactId'));
    expect(body).toMatch(/contact_id = \$\{contactId\}::text\b/);
    expect(body).not.toMatch(/::uuid/);
  });
});
