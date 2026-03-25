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

export interface MarketplaceAppointment {
  id: string;
  code: string;
  address: string;
  scheduledDate: string;
  timeSlot: string;
  latitude: number;
  longitude: number;
}
