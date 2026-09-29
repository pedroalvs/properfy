import { phoneSearchVariants } from '@properfy/shared';

/**
 * Prisma OR-fragments matching a phone stored in `field` against a typed term,
 * for a **dedicated contact-search** field (one whose only numeric meaning is a
 * phone number — e.g. the contacts-list search or the map's "Contact" input).
 *
 * The term is expanded into its canonical variants (see `phoneSearchVariants`),
 * so a local/spaced number matches the stored E.164 form. When the term yields
 * no variants — a plain name, or a numeric fragment shorter than the phone
 * threshold — it falls back to a raw substring match **only if the term
 * contains a digit**, preserving the pre-normalization behaviour for short
 * partial phone searches without adding a pointless phone clause for a name.
 *
 * NOT for a general search box that also spans postcode/address: there a short
 * numeric term must stay out of the phone clause, so call `phoneSearchVariants`
 * directly (no fallback) instead.
 */
export function phoneColumnSearchClauses(field: string, term: string): Record<string, unknown>[] {
  const variants = phoneSearchVariants(term);
  if (variants.length === 0) {
    return /\d/.test(term) ? [{ [field]: { contains: term } }] : [];
  }
  return variants.map((variant) => ({ [field]: { contains: variant } }));
}
