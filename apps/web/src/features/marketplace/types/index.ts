export interface MarketplaceOffer {
  groupId: string;
  /** Sequential human-friendly group code (pure numeric). Required — backend
   *  marketplace responses always include it. */
  groupNumber: number;
  code: string;
  tenantName: string;
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: string;
  priorityExpiresAt: string | null;
  suburbs: string[];
}

// Offer-detail shapes derive from the shared Zod response schema (single source
// of truth); each appointment carries its own `tenantName` so cross-agency
// groups can show which agency every inspection belongs to.
export type {
  MarketplaceOfferDetail,
  MarketplaceOfferDetailAppointment,
} from '@properfy/shared';

export interface MarketplaceAppointment {
  id: string;
  code: string;
  address: string;
  scheduledDate: string;
  timeSlot: string;
  latitude: number;
  longitude: number;
}
