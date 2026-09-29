import { phoneSearchVariants } from '@properfy/shared';

/**
 * Prisma OR-fragments matching a phone stored in `field` against a typed term,
 * for a **dedicated contact-search** field (one whose only numeric meaning is a
 * phone number — e.g. the contacts-list search or the map's "Contact" input).
 *
 * The term is expanded into its canonical variants (see `phoneSearchVariants`),
 * so a local/spaced full number matches the stored E.164 form. When the term
 * yields no variants — a plain name, or a numeric fragment shorter than the
 * phone threshold — it falls back to substring matches on the fragment itself
 * AND its trunk/country-stripped digits, so a leading-0 partial ("0412", the
 * most natural partial) still reaches the stored "+61412..." value. A term with
 * no digits (a name) produces no phone clause.
 *
 * NOT for a general search box that also spans postcode/address: there a short
 * numeric term must stay out of the phone clause, so call `phoneSearchVariants`
 * directly (no fallback) instead.
 *
 * `variants` may be passed in when the caller already computed it (e.g. to also
 * build a secondary-channel clause), to avoid recomputing.
 */
export function phoneColumnSearchClauses(
  field: string,
  term: string,
  variants: string[] = phoneSearchVariants(term),
): Record<string, unknown>[] {
  if (variants.length > 0) {
    return variants.map((variant) => ({ [field]: { contains: variant } }));
  }
  const trimmed = term.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return [];
  const forms = new Set<string>([trimmed, digits]);
  const national = digits.replace(/^(?:61|0)/, '');
  if (national) forms.add(national);
  return [...forms].map((form) => ({ [field]: { contains: form } }));
}
