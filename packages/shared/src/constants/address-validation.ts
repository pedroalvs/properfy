/**
 * On-screen address validation (V-1 and later V-3/V-4/V-5).
 *
 * A single source for the rejection code, the reasons and the English UI copy,
 * so every screen that validates an address on save (property, inspector base,
 * day origin, import) shows the same wording. The reasons mirror the backend
 * geocoding rule A (`classifyGeocodingResult`): `COARSE_RESULT`/`LOW_RELEVANCE`
 * come straight from a rejected result, and `NOT_FOUND` is a null geocode.
 */

/** Error `code` returned (HTTP 422) when an address cannot be verified on save. */
export const ADDRESS_NOT_VERIFIED_CODE = 'ADDRESS_NOT_VERIFIED';

export const ADDRESS_NOT_VERIFIED_REASONS = ['NOT_FOUND', 'COARSE_RESULT', 'LOW_RELEVANCE'] as const;
export type AddressNotVerifiedReason = (typeof ADDRESS_NOT_VERIFIED_REASONS)[number];

export interface AddressNotVerifiedMessage {
  /** The headline shown in the error block / on the address field. */
  field: string;
  /** The supporting line under the headline. */
  support: string;
}

/** The per-reason copy (§5.2 of the address-validator plan). */
export const ADDRESS_NOT_VERIFIED_MESSAGES: Record<AddressNotVerifiedReason, AddressNotVerifiedMessage> = {
  NOT_FOUND: {
    field: "We couldn't find this address.",
    support: 'Check the street, number, suburb and postcode.',
  },
  COARSE_RESULT: {
    field: 'We could only locate the area, not the exact address.',
    support: 'Add the street number, or correct the street name.',
  },
  LOW_RELEVANCE: {
    field: "This address doesn't match a known address closely enough.",
    support: 'Check the street, number, suburb and postcode.',
  },
};

/**
 * Shown when the provider was unreachable at save time but the record was kept
 * `PENDING` and will be re-checked by the worker (V4 "provider down" path).
 */
export const ADDRESS_CHECK_DEFERRED_MESSAGE =
  "We couldn't check this address right now; it will be checked again shortly.";

/** PWA-only: a save attempted while offline (V-3/V-4). */
export const ADDRESS_CHECK_OFFLINE_MESSAGE = "You're offline. Connect to save this address.";

/**
 * Non-blocking warning when an existing record whose stored address could not be
 * located is opened for editing (§5.3 "legacy record" state).
 */
export const ADDRESS_LEGACY_UNVERIFIED_MESSAGE =
  "This address couldn't be located. Update it or set the location manually.";

/** The address fields a verification failure marks as invalid, in focus order. */
export const ADDRESS_VALIDATION_FIELDS = ['street', 'suburb', 'postcode', 'state'] as const;
export type AddressValidationField = (typeof ADDRESS_VALIDATION_FIELDS)[number];
