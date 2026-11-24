import type { MarketplaceOffer as MarketplaceOfferResponse } from '@properfy/shared';

export type OfferAcceptState = 'IDLE' | 'CONFIRMING' | 'ACCEPTING' | 'ACCEPTED' | 'CONFLICT' | 'GONE' | 'ERROR';

/**
 * The marketplace list-endpoint contract, re-exported under the feature's own
 * name so the shape cannot drift from the shared response schema — `properties`,
 * in particular, arrives with the rest of the contract.
 */
export type MarketplaceOffer = MarketplaceOfferResponse;

// Offer-detail shapes derive from the shared Zod response schema (single source
// of truth); the per-appointment `tenantName` supports cross-agency groups.
export type {
  MarketplaceOfferDetail,
  MarketplaceOfferDetailAppointment,
  MarketplaceOfferProperty,
} from '@properfy/shared';
