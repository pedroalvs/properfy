import type { PriorityMode } from '@properfy/shared';

export interface MarketplaceOffer {
  id: string;
  groupId: string;
  groupName: string;
  regionName: string;
  priorityMode: PriorityMode;
  appointmentsCount: number;
  totalPayout: number;
  expiresAt: string;
  createdAt: string;
  appointments: MarketplaceAppointment[];
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

export interface OfferFiltersState {
  search: string;
  priorityMode: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_OFFER_FILTERS: OfferFiltersState = {
  search: '',
  priorityMode: '',
  dateFrom: '',
  dateTo: '',
};
