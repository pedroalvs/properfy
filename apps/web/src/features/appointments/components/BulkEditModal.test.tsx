import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import type { Appointment } from '../types';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

type FormOptionsResult = { options: Array<{ value: string; label: string }>; isLoading: boolean };
const emptyFormOptions: FormOptionsResult = { options: [], isLoading: false };
const mockUseFormOptions = vi.fn(((..._args: unknown[]) => emptyFormOptions) as (...args: unknown[]) => FormOptionsResult);
vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (...args: unknown[]) => mockUseFormOptions(...args),
}));

vi.mock('../hooks/useContactSearch', () => ({
  useContactSearch: () => ({
    search: '',
    debouncedSearch: '',
    results: [],
    isSearching: false,
    setSearch: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { BulkEditModal } from './BulkEditModal';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    appointmentNumber: 1,
    code: 'VST-001',
    tenantId: 'tenant-1',
    tenantName: 'Acme',
    branchId: 'branch-1',
    branchName: 'Main',
    propertyId: 'prop-1',
    propertyAddress: '10 Main',
    serviceTypeId: 'svc-1',
    serviceTypeName: 'Routine',
    status: 'DRAFT',
    tenantConfirmationStatus: 'PENDING',
    contactName: 'Tenant',
    contactPhone: null,
    contactEmail: null,
    inspectorId: null,
    inspectorName: null,
    scheduledDate: '2026-05-01',
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    keyRequired: false,
    notes: null,
    isOverdue: false,
    hasTenantNote: false,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function renderModal(selected: Appointment[]) {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <BulkEditModal
        selectedAppointments={selected}
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    </Wrapper>,
  );
}

describe('BulkEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFormOptions.mockImplementation(() => emptyFormOptions);
    mockPost.mockResolvedValue({ data: { data: { updated: 1, failed: [] } }, error: null });
  });

  it('renders the 5 expected fields and does NOT render Branch', () => {
    renderModal([makeAppointment()]);
    // Branch field intentionally removed from bulk edit
    expect(screen.queryByText(/^Branch$/)).not.toBeInTheDocument();
    // The remaining 5 fields are present
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getByText('Time Slot')).toBeInTheDocument();
    expect(screen.getByText('Service Type')).toBeInTheDocument();
    expect(screen.getByText(/Add Property Manager Contact/)).toBeInTheDocument();
  });

  it('Inspector field uses dropdown sourced from /v1/inspectors with the selection tenantId', () => {
    renderModal([makeAppointment({ tenantId: 'tenant-X' })]);
    fireEvent.click(screen.getByLabelText('Inspector'));
    expect(screen.getByLabelText('Set inspector')).toBeInTheDocument();

    const inspectorCall = mockUseFormOptions.mock.calls.find((args) => args[1] === '/v1/inspectors');
    expect(inspectorCall).toBeDefined();
    expect((inspectorCall as unknown[] | undefined)?.[3]).toMatchObject({ status: 'ACTIVE', tenantId: 'tenant-X' });
  });

  it('Service Type field uses dropdown sourced from /v1/service-types', () => {
    mockUseFormOptions.mockImplementation((..._args: unknown[]): FormOptionsResult => {
      const path = _args[1];
      if (path === '/v1/service-types') {
        return {
          options: [
            { value: 'svc-1', label: 'Routine' },
            { value: 'svc-2', label: 'Detailed' },
          ],
          isLoading: false,
        };
      }
      return { options: [], isLoading: false };
    });
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Service Type'));
    expect(screen.getByLabelText('Set service type')).toBeInTheDocument();

    const serviceTypeCall = mockUseFormOptions.mock.calls.find((args) => args[1] === '/v1/service-types');
    expect(serviceTypeCall).toBeDefined();
  });

  it('Time Slot toggle reveals a free start/end time range (no branch dependency)', () => {
    renderModal([
      makeAppointment({ id: 'a', branchId: 'b1' }),
      makeAppointment({ id: 'b', branchId: 'b2' }),
    ]);
    fireEvent.click(screen.getByLabelText('Time Slot'));
    // Free start/end inputs from the shared TimeRangeInput — available even when
    // the selection spans branches (the catalog dependency is gone).
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
  });

  it('emits BOTH timeSlotStart and timeSlotEnd in the bulk-edit changes payload', async () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Time Slot'));
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '16:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments/bulk-edit',
        expect.objectContaining({
          body: expect.objectContaining({
            changes: { timeSlotStart: '13:00', timeSlotEnd: '16:00' },
          }),
        }),
      );
    });
  });

  it('blocks submit and shows an error when end is not after start', async () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Time Slot'));
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '13:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(await screen.findByText('Start time must be before end time.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits propertyManagerContactPolicy=addIfMissing when PM contact field is enabled', async () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByText(/Add Property Manager Contact/));
    // Use Scheduled Date as a no-op carrier so submit has a non-empty change.
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: '2026-06-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments/bulk-edit',
        expect.objectContaining({
          body: expect.objectContaining({
            options: { propertyManagerContactPolicy: 'addIfMissing' },
          }),
        }),
      );
    });
  });

  it('does NOT include options.propertyManagerContactPolicy when PM field is unchecked', async () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: '2026-06-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    await waitFor(() => {
      const lastCall = mockPost.mock.calls.at(-1);
      const body = (lastCall?.[1] as { body?: Record<string, unknown> })?.body;
      expect(body).toBeDefined();
      expect(body!).not.toHaveProperty('options');
    });
  });
});
