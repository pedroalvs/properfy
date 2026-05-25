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

export interface MarketplaceOfferDetailAppointment {
  id: string;
  appointmentCode: string;
  appointmentNumber: number;
  suburb: string;
  keyRequired: boolean;
  notes: string | null;
  payoutAmount: number | null;
}

export interface MarketplaceOfferDetail extends MarketplaceOffer {
  addresses: string[];
  keyRequired: boolean;
  notes: string | null;
  appointments: MarketplaceOfferDetailAppointment[];
}
