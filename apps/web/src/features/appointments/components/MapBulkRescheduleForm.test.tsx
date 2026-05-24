/**
 * MapBulkRescheduleForm — C11-T4 regression guard.
 * Pins that branchId from AppointmentMapItem is forwarded to useTimeSlotOptions.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MapBulkRescheduleForm } from './MapBulkRescheduleForm';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// Capture the branchId passed to useTimeSlotOptions.
const capturedBranchIds: Array<string | undefined> = [];

vi.mock('../hooks/useTimeSlotOptions', () => ({
  useTimeSlotOptions: (branchId: string | undefined) => {
    capturedBranchIds.push(branchId);
    return { options: [] };
  },
}));
vi.mock('../hooks/useBulkReopenForReschedule', () => ({
  useBulkReopenForReschedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const BRANCH_ID = 'branch-aaa-111';

function makeAppointment(overrides: Partial<AppointmentMapItem> = {}): AppointmentMapItem {
  return {
    id: 'appt-1', code: 'INS-0001', status: 'SCHEDULED', propertyAddress: '1 Test St',
    latitude: 0, longitude: 0, scheduledDate: '2027-06-15', timeSlot: '09:00-10:00',
    inspectorName: null, branchName: 'Branch A', serviceGroupId: 'sg-1',
    ...overrides,
  };
}

function renderForm(appointments: AppointmentMapItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapBulkRescheduleForm
          checkedAppointments={appointments}
          onCancel={vi.fn()}
          onComplete={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MapBulkRescheduleForm — branchId propagation (C11-T4)', () => {
  it('passes branchId from first checked appointment to useTimeSlotOptions', () => {
    capturedBranchIds.length = 0;
    renderForm([makeAppointment({ branchId: BRANCH_ID })]);
    expect(capturedBranchIds.some((id) => id === BRANCH_ID)).toBe(true);
  });

  it('passes undefined branchId when appointments have no branchId', () => {
    capturedBranchIds.length = 0;
    renderForm([makeAppointment({ branchId: undefined })]);
    expect(capturedBranchIds[0]).toBeUndefined();
  });
});
