export type OfferAcceptState = 'IDLE' | 'CONFIRMING' | 'ACCEPTING' | 'ACCEPTED' | 'CONFLICT' | 'GONE' | 'ERROR';

export interface MarketplaceOffer {
  groupId: string;
  serviceTypeName: string;
  flowType: string;
  scheduledDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  region: string;
  suburbs: string[];
  appointmentCount: number;
  confirmedCount: number;
  pendingCount: number;
  distance: number | null;
  publishedAt: string;
}
