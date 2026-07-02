export interface AddressComponents {
  street: string;
  addressLine2?: string | null;
  suburb: string;
  state: string;
  postcode: string;
}

/**
 * Canonicalize address components into a single comparable key for exact
 * ("perfect match") deduplication. Shared by `PrismaPropertyRepository`
 * (which computes and persists it on every create/update, backing the
 * `properties_normalized_address_active_unique` partial unique index) and the
 * appointment-import row resolver (intra-batch dedupe + existing-property
 * lookup) — a single implementation so the two never disagree on what counts
 * as "the same address".
 *
 * Normalization: trim, collapse internal whitespace runs to one space,
 * lowercase. `addressLine2` absent/blank is coalesced to `''` — a property
 * with no unit and one with an explicitly empty unit are the same address.
 *
 * MUST stay in lockstep with the backfill SQL in migration
 * `20260701230009_property_normalized_address_uniqueness` (same trim +
 * whitespace-collapse + lowercase steps, same `|`-joined field order).
 */
export function buildNormalizedAddressKey(addr: AddressComponents): string {
  const norm = (value: string | null | undefined): string =>
    (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

  return [
    norm(addr.street),
    norm(addr.addressLine2),
    norm(addr.suburb),
    norm(addr.state),
    norm(addr.postcode),
  ].join('|');
}
