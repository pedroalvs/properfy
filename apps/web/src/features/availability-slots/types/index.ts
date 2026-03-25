export interface AvailabilitySlot {
  id: string;
  inspectorId: string;
  inspectorName: string;
  date: string;
  startTime: string;
  endTime: string;
  region: string;
  capacity: number;
  bookedCount: number;
  status: string;
  createdAt: string;
}

export interface SlotFormData {
  inspectorId: string;
  date: string;
  startTime: string;
  endTime: string;
  region: string;
  capacity: number;
}

export interface SlotFormErrors {
  inspectorId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  region?: string;
  capacity?: string;
}

export interface SlotFiltersState {
  inspectorId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_SLOT_FILTERS: SlotFiltersState = {
  inspectorId: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

export const DEFAULT_SLOT_FORM: SlotFormData = {
  inspectorId: '',
  date: '',
  startTime: '08:00',
  endTime: '17:00',
  region: '',
  capacity: 1,
};
