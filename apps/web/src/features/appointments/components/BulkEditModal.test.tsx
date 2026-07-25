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

let mockCanReview = true;
let mockCanChangeStatus = true;
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: 'OP',
    hasRole: () => true,
    canPerform: (action: string) => {
      if (action === 'appointment.cross_check') return mockCanReview;
      if (action === 'appointment.bulk_status_transition') return mockCanChangeStatus;
      return true;
    },
    hasClUserFlag: () => true,
  }),
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
    rentalTenantConfirmationStatus: 'PENDING',
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
    hasRentalTenantNote: false,
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
    mockCanReview = true;
    mockCanChangeStatus = true;
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

  it('opens the native picker when the scheduled date input is clicked', () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    const input = screen.getByLabelText('Set scheduled date') as HTMLInputElement;
    const showPickerSpy = vi.fn();
    input.showPicker = showPickerSpy;
    fireEvent.click(input);
    expect(showPickerSpy).toHaveBeenCalledTimes(1);
  });

  describe('Mark as Reviewed', () => {
    it('shows the toggle for AM/OP and hides it without the cross_check permission', () => {
      const { rerender } = renderModal([makeAppointment({ status: 'DONE' })]);
      expect(screen.getByText('Mark as Reviewed')).toBeInTheDocument();

      mockCanReview = false;
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <SnackbarProvider>
            <BulkEditModal selectedAppointments={[makeAppointment({ status: 'DONE' })]} open onClose={vi.fn()} onSuccess={vi.fn()} />
          </SnackbarProvider>
        </QueryClientProvider>,
      );
      expect(screen.queryByText('Mark as Reviewed')).not.toBeInTheDocument();
    });

    it('shows how many of the selection are DONE and pending review', () => {
      renderModal([
        makeAppointment({ id: 'a', status: 'DONE' }),
        makeAppointment({ id: 'b', status: 'DONE', doneCheckedByUserId: 'someone' }),
        makeAppointment({ id: 'c', status: 'SCHEDULED' }),
      ]);
      fireEvent.click(screen.getByLabelText('Mark as Reviewed'));
      expect(
        screen.getByText('1 of 3 selected are DONE and pending review; the others will be skipped.'),
      ).toBeInTheDocument();
    });

    it('submits the bulk cross-check endpoint with the selected ids', async () => {
      renderModal([makeAppointment({ id: 'a', status: 'DONE' }), makeAppointment({ id: 'b', status: 'DONE' })]);
      fireEvent.click(screen.getByLabelText('Mark as Reviewed'));
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/v1/appointments/bulk-cross-check-done',
          { body: { ids: ['a', 'b'] } },
        );
      });
    });

    it('renders partial failures in the result view', async () => {
      mockPost.mockResolvedValue({
        data: { data: { updated: 1, failed: [{ id: 'b', code: 'APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS', message: 'Cross-check is only allowed for DONE appointments' }] } },
        error: null,
      });
      renderModal([makeAppointment({ id: 'a', status: 'DONE' }), makeAppointment({ id: 'b', status: 'SCHEDULED' })]);
      fireEvent.click(screen.getByLabelText('Mark as Reviewed'));
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      expect(await screen.findByText('1 updated')).toBeInTheDocument();
      expect(screen.getByText('1 failed')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show error details/ }));
      expect(screen.getByText(/only allowed for DONE/)).toBeInTheDocument();
    });

    it('disables the field toggles while Mark as Reviewed is checked', () => {
      renderModal([makeAppointment({ status: 'DONE' })]);
      fireEvent.click(screen.getByLabelText('Mark as Reviewed'));
      expect(screen.getByLabelText('Inspector')).toBeDisabled();
      expect(screen.getByLabelText('Scheduled Date')).toBeDisabled();
    });
  });

  describe('Change status', () => {
    /** Opens the target-status dropdown and picks the option with this label. */
    function chooseTarget(label: string) {
      fireEvent.click(screen.getByLabelText('Set target status'));
      fireEvent.click(screen.getByRole('option', { name: label }));
    }

    it('shows the toggle for AM/OP and hides it without the bulk_status_transition permission', () => {
      renderModal([makeAppointment()]);
      expect(screen.getByText('Change status')).toBeInTheDocument();

      mockCanChangeStatus = false;
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <BulkEditModal selectedAppointments={[makeAppointment()]} open onClose={vi.fn()} onSuccess={vi.fn()} />
        </Wrapper>,
      );
      // Only the first render's row remains — the second render has none.
      expect(screen.getAllByText('Change status')).toHaveLength(1);
    });

    it('offers only targets EVERY selected row can reach (intersection, not union)', () => {
      // DRAFT → AWAITING_INSPECTOR | REJECTED | CANCELLED
      // SCHEDULED →                  REJECTED | CANCELLED
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT' }),
        makeAppointment({ id: 'b', status: 'SCHEDULED' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      fireEvent.click(screen.getByLabelText('Set target status'));

      expect(screen.getByRole('option', { name: 'Rejected' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Cancelled' })).toBeInTheDocument();
      // Reachable from DRAFT but NOT from SCHEDULED — must not be offered.
      expect(screen.queryByRole('option', { name: 'Awaiting Inspector' })).not.toBeInTheDocument();
    });

    it('tells the operator when the selection has no transition in common', () => {
      // DRAFT → AWAITING_INSPECTOR | REJECTED | CANCELLED
      // CANCELLED → DRAFT                              → intersection is empty
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT' }),
        makeAppointment({ id: 'b', status: 'CANCELLED' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      expect(
        screen.getByText('No common transition is available for the selected rows.'),
      ).toBeInTheDocument();
    });

    it('asks for a reason only when the chosen transition requires one', () => {
      renderModal([makeAppointment({ status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));

      // DRAFT → AWAITING_INSPECTOR is reasonRequired: false
      chooseTarget('Awaiting Inspector');
      expect(screen.queryByLabelText('Status change reason')).not.toBeInTheDocument();

      // DRAFT → CANCELLED is reasonRequired: true
      chooseTarget('Cancelled');
      expect(screen.getByLabelText('Status change reason')).toBeInTheDocument();
    });

    it('requires a reason when ANY selected row requires one for that target', () => {
      // DRAFT → AWAITING_INSPECTOR does NOT require a reason, but
      // REJECTED → AWAITING_INSPECTOR DOES. Deciding from the first row alone
      // would let the request through and the REJECTED rows would be rejected
      // server-side, so the stricter row must win.
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT' }),
        makeAppointment({ id: 'b', status: 'REJECTED' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Awaiting Inspector');

      expect(screen.getByLabelText('Status change reason')).toBeInTheDocument();
    });

    it('keeps Apply disabled until a target — and any required reason — is filled in', () => {
      renderModal([makeAppointment({ status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));

      const apply = screen.getByRole('button', { name: 'Apply Changes' });
      expect(apply).toBeDisabled();

      chooseTarget('Cancelled');
      expect(apply).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Status change reason'), { target: { value: 'no' } });
      expect(apply).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      expect(apply).toBeEnabled();
    });

    it('submits the bulk status-transition endpoint with the ids, target and reason', async () => {
      mockPost.mockResolvedValue({ data: { data: { results: [] } }, error: null });
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT' }),
        makeAppointment({ id: 'b', status: 'DRAFT' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/v1/appointments/bulk-status-transition', {
          body: {
            appointmentIds: ['a', 'b'],
            targetStatus: 'CANCELLED',
            reason: 'Tenant moved out',
          },
        });
      });
    });

    it('omits the reason when the transition does not require one', async () => {
      mockPost.mockResolvedValue({ data: { data: { results: [] } }, error: null });
      renderModal([makeAppointment({ id: 'a', status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Awaiting Inspector');
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/v1/appointments/bulk-status-transition', {
          body: { appointmentIds: ['a'], targetStatus: 'AWAITING_INSPECTOR' },
        });
      });
    });

    it('is mutually exclusive with the field edits and with Mark as Reviewed', () => {
      renderModal([makeAppointment({ status: 'DRAFT' })]);

      fireEvent.click(screen.getByLabelText('Change status'));
      expect(screen.getByLabelText('Inspector')).toBeDisabled();
      expect(screen.getByLabelText('Scheduled Date')).toBeDisabled();
      expect(screen.getByLabelText('Mark as Reviewed')).toBeDisabled();

      // ...and the other way round.
      fireEvent.click(screen.getByLabelText('Change status'));
      fireEvent.click(screen.getByLabelText('Inspector'));
      expect(screen.getByLabelText('Change status')).toBeDisabled();
    });

    it('reports per-row failures from the bulk envelope in the result view', async () => {
      mockPost.mockResolvedValue({
        data: {
          data: {
            results: [
              { appointmentId: 'a', status: 'OK' },
              {
                appointmentId: 'b',
                status: 'INVALID_TRANSITION',
                // The envelope carries a domain {code, message}, not a string.
                error: { code: 'APPOINTMENT_INVALID_TRANSITION', message: 'Cannot go from DONE to CANCELLED' },
              },
            ],
          },
        },
        error: null,
      });
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT' }),
        makeAppointment({ id: 'b', status: 'DRAFT' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      expect(await screen.findByText('1 updated')).toBeInTheDocument();
      expect(screen.getByText('1 failed')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show error details/ }));
      expect(screen.getByText(/Cannot go from DONE to CANCELLED/)).toBeInTheDocument();
    });

    it('identifies failed rows by appointment code, not by a raw id fragment', async () => {
      mockPost.mockResolvedValue({
        data: {
          data: {
            results: [
              {
                appointmentId: 'b',
                status: 'FORBIDDEN',
                error: { code: 'APPOINTMENT_TRANSITION_NOT_PERMITTED', message: 'Not permitted for your role' },
              },
            ],
          },
        },
        error: null,
      });
      renderModal([makeAppointment({ id: 'b', code: 'VST-014', status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      fireEvent.click(await screen.findByRole('button', { name: /Show error details/ }));
      expect(screen.getByText('VST-014')).toBeInTheDocument();
      expect(screen.queryByText(/^b\.\.\./)).not.toBeInTheDocument();
    });

    it('counts an IDEMPOTENT_REPLAY as updated, not as a failure', async () => {
      // The backend guard is a 3-minute double-click window, so a replay is
      // the operator's own duplicate submit — reporting it as a failure would
      // be noise. All-replay batches therefore close the modal like a success.
      mockPost.mockResolvedValue({
        data: { data: { results: [{ appointmentId: 'a', status: 'IDEMPOTENT_REPLAY' }] } },
        error: null,
      });
      renderModal([makeAppointment({ id: 'a', status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Awaiting Inspector');
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled();
      });
      expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
    });
  });
});
