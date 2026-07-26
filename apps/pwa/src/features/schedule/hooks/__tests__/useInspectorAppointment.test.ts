import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.fn();

vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => mockGet(...args) },
}));

import { useInspectorAppointment } from '../useInspectorAppointment';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

const MOCK_RAW_DETAIL = {
  id: 'apt-01',
  appointmentCode: 'INS-0042',
  propertyAddress: '123 Test St',
  suburb: 'Kogarah',
  scheduledDate: '2026-08-01',
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  status: 'SCHEDULED',
  rentalTenantConfirmation: 'CONFIRMED',
  serviceTypeName: 'Routine',
  flowType: 'ROUTINE',
  rentalTenantName: 'Jane Tenant',
  rentalTenantPhone: null,
  rentalTenantEmail: null,
  keyRequired: false,
  meetingLocation: null,
  restrictionsSummary: null,
  restrictions: [],
  propertyLatitude: null,
  propertyLongitude: null,
  notes: null,
  observation: null,
  customFields: [],
  isOverdue: false,
  agencyName: 'Test Agency',
  apps: [],
  jobDetails: { keyLocation: 'Front desk' },
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_RAW_DETAIL } });
});

describe('useInspectorAppointment', () => {
  it('maps the raw payload into an InspectorAppointment', async () => {
    const { result } = renderHook(() => useInspectorAppointment('apt-01'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.data.appointmentCode).toBe('INS-0042');
    expect(result.current.jobDetails).toEqual({ keyLocation: 'Front desk' });
  });

  it('keeps a stable mapped data reference across re-renders with unchanged payload', async () => {
    // Regression guard for the PR #961 bug class (web AppointmentFormDrawer
    // freeze): rebuilding the mapped wrapper object on every render hands
    // consumers a fresh reference each cycle — any future effect keyed on it
    // would setState into an infinite render loop that starves router updates.
    const { result, rerender } = renderHook(() => useInspectorAppointment('apt-01'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.data;
    expect(first).toBeDefined();
    rerender();
    expect(result.current.data).toBe(first);
  });
});
