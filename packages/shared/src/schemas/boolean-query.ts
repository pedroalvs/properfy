import { z } from 'zod';

/**
 * A boolean carried in a query string.
 *
 * Do NOT use `z.coerce.boolean()` for this. Coercion applies JS truthiness to
 * the raw text, so every non-empty string — including `"false"` — becomes
 * `true`. A filter built on it can never be switched off and silently returns
 * the opposite of what the caller asked for.
 *
 * Accepts real booleans (JSON bodies), the literal spellings a query string can
 * carry, and 1/0 in either form — numeric flags were the one case plain
 * coercion already got right, so that contract is preserved. Anything else is
 * rejected rather than guessed at, so a typo surfaces as a 400 instead of a
 * wrong result set.
 */
export function booleanQueryParam() {
  return z
    .union([
      z.boolean(),
      z.literal('true'),
      z.literal('false'),
      z.literal('1'),
      z.literal('0'),
      z.literal(1),
      z.literal(0),
    ])
    .transform((value) => value === true || value === 'true' || value === 1 || value === '1');
}
