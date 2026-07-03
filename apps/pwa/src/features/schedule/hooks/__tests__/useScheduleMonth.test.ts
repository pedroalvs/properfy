import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AppointmentStatus, RentalTenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import { useScheduleMonth } from '../useScheduleMonth';

const mockApiGet = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

const monthlyResponse = {
  data: {
    today: '2026-03-21',
    from: '2026-03-21',
    to: '2026-04-20',
    days: [{ date: '2026-03-21', count: 1, hasUrgent: false }],
    appointments: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        appointmentCode: 'INS-0001',
        status: AppointmentStatus.SCHEDULED,
        scheduledDate: '2026-03-21',
        timeSlotStart: '09:00',
        timeSlotEnd: '11:00',
        serviceTypeId: '00000000-0000-0000-0000-000000000002',
        propertyId: '00000000-0000-0000-0000-000000000003',
        propertyAddress: '1 Test St, Sydney NSW 2000',
        suburb: 'Sydney',
        serviceTypeName: 'Routine Inspection',
        flowType: ServiceTypeFlowType.ROUTINE,
        rentalTenantConfirmationStatus: RentalTenantConfirmationStatus.CONFIRMED,
        keyRequired: false,
        meetingLocation: null,
        executionStatus: 'NOT_STARTED',
        agencyName: 'Test Agency',
      },
    ],
    overdueAppointments: [],
  },
};

describe('useScheduleMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the PWA schedule with one monthly endpoint call', async () => {
    mockApiGet.mockResolvedValue(monthlyResponse);

    const { result } = renderHook(() => useScheduleMonth(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith('/v1/inspector/schedule/month');
    expect(result.current.data?.days).toEqual(monthlyResponse.data.days);
    expect(result.current.data?.appointments[0]).toMatchObject({
      id: '00000000-0000-0000-0000-000000000001',
      propertyAddress: '1 Test St, Sydney NSW 2000',
      suburb: 'Sydney',
      rentalTenantConfirmation: RentalTenantConfirmationStatus.CONFIRMED,
    });
  });
});
