import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { booleanQueryParam } from './boolean-query';

/**
 * Query strings carry booleans as text. `z.coerce.boolean()` applies JS
 * truthiness to that text, so `?flag=false` arrives as `true` and the flag can
 * never be switched off — a filter built on it silently does the opposite of
 * what the caller asked for.
 */
describe('booleanQueryParam', () => {
  const schema = booleanQueryParam();

  it('parses "false" as false — the case z.coerce.boolean() gets wrong', () => {
    expect(schema.parse('false')).toBe(false);
  });

  it('parses "true" as true', () => {
    expect(schema.parse('true')).toBe(true);
  });

  it('accepts the numeric spellings, as string or number', () => {
    expect(schema.parse('1')).toBe(true);
    expect(schema.parse('0')).toBe(false);
    // Numbers were the one input plain coercion already handled correctly —
    // existing callers rely on it.
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse(0)).toBe(false);
  });

  it('passes real booleans through untouched', () => {
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('rejects ambiguous values instead of guessing', () => {
    // Silently treating "yes"/"" as true is how the original bug hid.
    for (const bad of ['yes', 'no', '', 'TRUE', 2, null]) {
      expect(schema.safeParse(bad).success, `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });

  it('composes with .optional() and .default()', () => {
    const optional = z.object({ flag: booleanQueryParam().optional() });
    expect(optional.parse({}).flag).toBeUndefined();
    expect(optional.parse({ flag: 'false' }).flag).toBe(false);

    const defaulted = z.object({ flag: booleanQueryParam().default(true) });
    expect(defaulted.parse({}).flag).toBe(true);
    expect(defaulted.parse({ flag: 'false' }).flag).toBe(false);
  });
});
