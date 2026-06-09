export type OfferAcceptState = 'IDLE' | 'CONFIRMING' | 'ACCEPTING' | 'ACCEPTED' | 'CONFLICT' | 'GONE' | 'ERROR';

export interface MarketplaceOffer {
  groupId: string;
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: string;
  priorityExpiresAt: string | null;
  suburbs: string[];
  payoutEstimate: number | null;
  appointmentCount: number;
  centroid: { lat: number; lng: number } | null;
}

// Offer-detail shapes derive from the shared Zod response schema (single source
// of truth); the per-appointment `tenantName` supports cross-agency groups.
export type {
  MarketplaceOfferDetail,
  MarketplaceOfferDetailAppointment,
} from '@properfy/shared';
