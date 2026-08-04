import type { MarketplaceOffer as MarketplaceOfferResponse } from '@properfy/shared';

export type OfferAcceptState = 'IDLE' | 'CONFIRMING' | 'ACCEPTING' | 'ACCEPTED' | 'CONFLICT' | 'GONE' | 'ERROR';

/**
 * The list-endpoint contract plus two fields the UI reads but the backend does
 * not send yet (the priority countdown is rendered only when they are present).
 * Everything else is inherited so the shape cannot drift from the response
 * schema — `properties`, in particular, arrives with the rest of the contract.
 */
export interface MarketplaceOffer extends MarketplaceOfferResponse {
  priorityMode?: string;
  priorityExpiresAt?: string | null;
}

// Offer-detail shapes derive from the shared Zod response schema (single source
// of truth); the per-appointment `tenantName` supports cross-agency groups.
export type {
  MarketplaceOfferDetail,
  MarketplaceOfferDetailAppointment,
  MarketplaceOfferProperty,
} from '@properfy/shared';
