import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `apps/web` and `apps/pwa` deliberately keep separate Tailwind configs with byte-identical
 * colour maps and an identical `token()` helper. Extracting the helper into a package is
 * the obvious alternative and it is the wrong one here: the config is loaded by jiti at
 * dev-server and build start, before Turbo has necessarily built a workspace dependency's
 * `dist/`, so a cold `pnpm dev` could fail to resolve it or silently pick up stale output.
 *
 * Duplication is the trade, and this test is the price — it fails when the two drift, which
 * is the only failure mode duplication actually introduces. Without it, a token added to one
 * app is a class that silently emits nothing in the other, which is exactly the family of bug
 * #1041 was.
 */
const CONFIGS = {
  web: resolve(__dirname, '../../tailwind.config.ts'),
  pwa: resolve(__dirname, '../../../pwa/tailwind.config.ts'),
} as const;

/** Pulls a brace-delimited block out of the config source, given its opening line. */
function block(source: string, opening: string): string {
  const start = source.indexOf(opening);
  expect(start, `${opening} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces after ${opening}`);
}

describe('tailwind config parity between web and pwa', () => {
  const sources = {
    web: readFileSync(CONFIGS.web, 'utf8'),
    pwa: readFileSync(CONFIGS.pwa, 'utf8'),
  };

  it('declares the same colour map in both apps', () => {
    expect(block(sources.web, 'colors: {')).toBe(block(sources.pwa, 'colors: {'));
  });

  it('declares the same opacity scale extension in both apps', () => {
    expect(block(sources.web, 'opacity: {')).toBe(block(sources.pwa, 'opacity: {'));
  });

  it('uses the same token() helper body in both apps', () => {
    // Comments above the helper differ (each points at the other app); the code must not.
    const helper = (source: string) => {
      // Starts at the regexes, not at `const token = `: NUMERIC_ALPHA and PERCENT_ALPHA
      // are what decide which branch the helper takes, so leaving them outside the
      // compared span would let the two apps disagree while parity still reported green.
      const start = source.indexOf('const NUMERIC_ALPHA');
      const end = source.indexOf('as unknown) as string;');
      // Without these, a rename makes both indexOf calls return -1, both slices return
      // '', and `expect('').toBe('')` passes — a parity test that stops comparing
      // anything while still reporting green.
      expect(start, 'token() helper not found').toBeGreaterThan(-1);
      expect(end, 'token() helper terminator not found').toBeGreaterThan(start);
      // The JSDoc between the regexes and the helper names the *other* app, so it is
      // legitimately different; strip it rather than forcing the two to lie.
      return source.slice(start, end).replace(/\/\*\*[\s\S]*?\*\//, '');
    };
    expect(helper(sources.web)).toBe(helper(sources.pwa));
  });

  it.each(['web', 'pwa'] as const)('resolves every %s token to a declared custom property', (app) => {
    // The third link in the chain: a colour may be mapped and emitted and still paint
    // nothing if the custom property behind it was renamed or never declared.
    const tokensCss = readFileSync(
      resolve(CONFIGS[app], '../src/styles/tokens.css'),
      'utf8',
    );
    // Accept either quote style and digit-bearing names — `token("chart-1")` must not
    // slip past this check just because the pattern was written for the names that
    // happened to exist on the day it was added.
    const referenced = [...sources[app].matchAll(/token\(['"]([a-z0-9-]+)['"]\)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(tokensCss, `--color-${name} is not declared`).toContain(`--color-${name}:`);
    }
  });
});
