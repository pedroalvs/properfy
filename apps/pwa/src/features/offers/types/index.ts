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
}
