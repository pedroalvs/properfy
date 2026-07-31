import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import type { Appointment } from '../types';

/**
 * A date comfortably in the future. Hardcoding one rots — the previous literal
 * was future when written and later tripped the past-date submit guard.
 */
const FUTURE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();

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

const mockUseContactSearch = vi.fn((..._args: unknown[]) => ({
  search: '',
  debouncedSearch: '',
  results: [] as unknown[],
  isSearching: false,
  setSearch: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('../hooks/useContactSearch', () => ({
  useContactSearch: (...args: unknown[]) => mockUseContactSearch(...args),
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
  // MemoryRouter: failure rows link to the blocking service group, and a bare
  // <Link> throws "useHref() may be used only in the context of a <Router>".
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SnackbarProvider>{children}</SnackbarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function renderModal(
  selected: Appointment[],
  handlers: { onClose?: () => void; onSuccess?: () => void } = {},
) {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <BulkEditModal
        selectedAppointments={selected}
        open
        onClose={handlers.onClose ?? vi.fn()}
        onSuccess={handlers.onSuccess ?? vi.fn()}
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

  it('rejects a past scheduled date at submit instead of sending it', async () => {
    // DateInput flags an out-of-range value but still emits it, so the submit
    // path is the only thing standing between the user and a server rejection.
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: '2020-01-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(await screen.findByText('Scheduled date cannot be in the past.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects an incomplete scheduled date instead of silently dropping it', async () => {
    // An incomplete date emits '', which the change-collection loop skips — so
    // without this the field would be enabled and simply ignored.
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: '15/06' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(await screen.findByText('Enter a complete scheduled date.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits propertyManagerContactPolicy=addIfMissing when PM contact field is enabled', async () => {
    renderModal([makeAppointment()]);
    fireEvent.click(screen.getByText(/Add Property Manager Contact/));
    // Use Scheduled Date as a no-op carrier so submit has a non-empty change.
    fireEvent.click(screen.getByLabelText('Scheduled Date'));
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: FUTURE_DATE } });

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
    fireEvent.change(screen.getByLabelText('Set scheduled date'), { target: { value: FUTURE_DATE } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

    await waitFor(() => {
      const lastCall = mockPost.mock.calls.at(-1);
      const body = (lastCall?.[1] as { body?: Record<string, unknown> })?.body;
      expect(body).toBeDefined();
      expect(body!).not.toHaveProperty('options');
    });
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

  describe('Property Manager contact', () => {
    it('scopes the contact search to the selection tenant', () => {
      // useContactSearch is disabled unless it receives a tenantId, so omitting
      // it left this field permanently unable to return a single contact.
      renderModal([makeAppointment({ tenantId: 'tenant-X' })]);
      fireEvent.click(screen.getByLabelText(/Add Property Manager Contact/));

      expect(mockUseContactSearch).toHaveBeenCalledWith(true, 'tenant-X');
    });

    it('does not search across a multi-tenant selection', () => {
      // Contacts are per-agency; with no single tenant there is nothing valid
      // to scope by, matching how the inspector field already behaves.
      renderModal([
        makeAppointment({ id: 'a', tenantId: 'tenant-A' }),
        makeAppointment({ id: 'b', tenantId: 'tenant-B' }),
      ]);
      fireEvent.click(screen.getByLabelText(/Add Property Manager Contact/));

      expect(mockUseContactSearch).toHaveBeenCalledWith(false, undefined);
    });
  });

  describe('Change status', () => {
    /** Opens the target-status dropdown and picks the option with this label. */
    function chooseTarget(label: string) {
      fireEvent.click(screen.getByLabelText('Set target status'));
      fireEvent.click(screen.getByRole('option', { name: label }));
    }

    it('shows the toggle for AM/OP', () => {
      renderModal([makeAppointment()]);
      expect(screen.getByText('Change status')).toBeInTheDocument();
    });

    it('hides the toggle without the bulk_status_transition permission', () => {
      mockCanChangeStatus = false;
      renderModal([makeAppointment()]);
      expect(screen.queryByText('Change status')).not.toBeInTheDocument();
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

    it('brings its own row into view when checked', () => {
      // It is the last row in a scrolling dialog, so the controls it reveals
      // land below the fold and the target dropdown opens into the clipped
      // region. Observed on staging: the menu looked empty until scrolled.
      const original = Element.prototype.scrollIntoView;
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        renderModal([makeAppointment({ status: 'DRAFT' })]);
        expect(scrollIntoView).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText('Change status'));
        expect(scrollIntoView).toHaveBeenCalled();
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it('drops a stale target when the selection changes underneath it', () => {
      // targetStatus is derived, not stored: if the new selection cannot reach
      // the target that was already picked, the pick must vanish rather than
      // sit invisibly in state while SelectInput shows the placeholder.
      const Wrapper = createWrapper();
      const { rerender } = render(
        <Wrapper>
          <BulkEditModal
            selectedAppointments={[makeAppointment({ id: 'a', status: 'DRAFT' })]}
            open
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </Wrapper>,
      );
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Awaiting Inspector');
      expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeEnabled();

      // A CANCELLED row can only reach DRAFT, so the earlier pick is now invalid.
      rerender(
        <Wrapper>
          <BulkEditModal
            selectedAppointments={[makeAppointment({ id: 'a', status: 'CANCELLED' })]}
            open
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </Wrapper>,
      );
      expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
    });

    it('drops the reason when the target changes', () => {
      // The text justifies a specific transition; carrying it to another target
      // would submit it unread.
      renderModal([makeAppointment({ status: 'SCHEDULED' })]);
      fireEvent.click(screen.getByLabelText('Change status'));

      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      expect(screen.getByLabelText('Status change reason')).toHaveValue('Tenant moved out');

      chooseTarget('Rejected');
      expect(screen.getByLabelText('Status change reason')).toHaveValue('');
    });

    it('discards the picked target when the row is unchecked', () => {
      renderModal([makeAppointment({ status: 'DRAFT' })]);

      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });

      // Uncheck, then re-check: nothing from the abandoned attempt survives.
      fireEvent.click(screen.getByLabelText('Change status'));
      fireEvent.click(screen.getByLabelText('Change status'));

      expect(screen.queryByLabelText('Status change reason')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeDisabled();
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

    it('never offers the tenant opt-in when no selected tenant has confirmed', () => {
      // The shared fixture is PENDING, so cancelling it must offer nothing.
      renderModal([makeAppointment({ id: 'a', status: 'DRAFT' })]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');

      expect(screen.queryByTestId('bulk-edit-notify-block')).not.toBeInTheDocument();
    });

    it('offers the tenant opt-in only for CANCELLED, and never pre-ticked', () => {
      renderModal([
        makeAppointment({ id: 'a', status: 'DRAFT', rentalTenantConfirmationStatus: 'CONFIRMED' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));

      // Not offered until the target is CANCELLED.
      expect(screen.queryByTestId('bulk-edit-notify-block')).not.toBeInTheDocument();

      chooseTarget('Cancelled');
      expect(screen.getByLabelText('Notify the tenants who confirmed')).not.toBeChecked();

      // Off is the deliberate default: a tick must not survive a target change and
      // come back pre-checked.
      fireEvent.click(screen.getByText('Notify the tenants who confirmed'));
      expect(screen.getByLabelText('Notify the tenants who confirmed')).toBeChecked();
      chooseTarget('Rejected');
      expect(screen.queryByTestId('bulk-edit-notify-block')).not.toBeInTheDocument();
      chooseTarget('Cancelled');
      expect(screen.getByLabelText('Notify the tenants who confirmed')).not.toBeChecked();
    });

    it('identifies failed rows by appointment code, not by a raw id fragment', async () => {
      mockPost.mockResolvedValue({
        data: {
          data: {
            results: [
              {
                // A distinctive id, so the "no raw id fragment" assertion below
                // cannot pass vacuously the way a single letter would.
                appointmentId: 'apt-uuid-9f21',
                status: 'FORBIDDEN',
                error: { code: 'APPOINTMENT_TRANSITION_NOT_PERMITTED', message: 'Not permitted for your role' },
              },
            ],
          },
        },
        error: null,
      });
      const { container } = renderModal([
        makeAppointment({ id: 'apt-uuid-9f21', code: 'VST-014', status: 'DRAFT' }),
      ]);
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Cancelled');
      fireEvent.change(screen.getByLabelText('Status change reason'), {
        target: { value: 'Tenant moved out' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      fireEvent.click(await screen.findByRole('button', { name: /Show error details/ }));
      expect(screen.getByText('VST-014')).toBeInTheDocument();
      // Assert against the whole rendered text, so an id fragment sitting
      // alongside other row content is still caught.
      expect(container.textContent).not.toMatch(/apt-uuid/);
    });

    it('counts an IDEMPOTENT_REPLAY as updated, not as a failure', async () => {
      // The backend guard is a 3-minute double-click window, so a replay is
      // the operator's own duplicate submit — reporting it as a failure would
      // be noise. An all-replay batch therefore reports success, which is what
      // the list page turns into closing the modal and clearing the selection
      // (the modal itself never calls onClose on this path).
      mockPost.mockResolvedValue({
        data: { data: { results: [{ appointmentId: 'a', status: 'IDEMPOTENT_REPLAY' }] } },
        error: null,
      });
      const onSuccess = vi.fn();
      renderModal([makeAppointment({ id: 'a', status: 'DRAFT' })], { onSuccess });
      fireEvent.click(screen.getByLabelText('Change status'));
      chooseTarget('Awaiting Inspector');
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      // An all-replay batch is reported as a success and closes the modal —
      // it never lands in the failure list.
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
      expect(await screen.findByText('1 updated')).toBeInTheDocument();
      expect(screen.queryByText(/failed/)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Service groups: a member's date belongs to the group, so say so BEFORE the
  // operator submits, and name the group in the failure rows afterwards.
  // ---------------------------------------------------------------------------
  describe('service group awareness', () => {
    const grouped = (overrides: Partial<Appointment> = {}) =>
      makeAppointment({ serviceGroupId: 'sg-1', serviceGroupCode: '36', ...overrides });

    it('warns that grouped rows have a group-managed date before submitting', () => {
      renderModal([grouped({ id: 'a', code: 'AGE-0288' }), grouped({ id: 'b', code: 'AGE-0287' })]);
      fireEvent.click(screen.getByLabelText('Scheduled Date'));

      expect(
        screen.getByText(/2 of 2 selected appointments belong to a service group/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/reschedule the group instead/i)).toBeInTheDocument();
    });

    it('counts only the grouped rows in a mixed selection', () => {
      renderModal([grouped({ id: 'a' }), makeAppointment({ id: 'b', code: 'TST-0273' })]);
      fireEvent.click(screen.getByLabelText('Scheduled Date'));

      expect(
        screen.getByText(/1 of 2 selected appointments belong to a service group/i),
      ).toBeInTheDocument();
    });

    it('stays quiet when nothing in the selection is grouped', () => {
      renderModal([makeAppointment({ id: 'a' })]);
      fireEvent.click(screen.getByLabelText('Scheduled Date'));

      expect(screen.queryByText(/belong to a service group/i)).not.toBeInTheDocument();
    });

    // Assigning an inspector to grouped rows is a legal, common bulk action.
    // Warning about the group date there would train operators to dismiss the
    // banner, which is precisely when it matters.
    it('does not cry wolf on bulk actions that leave the schedule alone', () => {
      renderModal([grouped({ id: 'a' }), grouped({ id: 'b' })]);

      // Nothing selected yet.
      expect(screen.queryByText(/belong to a service group/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Inspector'));
      expect(screen.queryByText(/belong to a service group/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Inspector'));
      fireEvent.click(screen.getByLabelText('Time Slot'));
      expect(screen.getByText(/belong to a service group/i)).toBeInTheDocument();
    });

    it('names how many groups a widen would permanently affect', () => {
      renderModal([
        grouped({ id: 'a', serviceGroupId: 'sg-1' }),
        grouped({ id: 'b', serviceGroupId: 'sg-2' }),
      ]);
      fireEvent.click(screen.getByLabelText('Time Slot'));

      expect(screen.getByLabelText(/widen the time window of all 2 groups/i)).toBeInTheDocument();
    });

    it('offers widening the group window only when grouped rows are selected', () => {
      const { unmount } = renderModal([makeAppointment({ id: 'a' })]);
      fireEvent.click(screen.getByLabelText('Time Slot'));
      expect(screen.queryByLabelText(/widen the group/i)).not.toBeInTheDocument();
      unmount();

      renderModal([grouped({ id: 'b' })]);
      fireEvent.click(screen.getByLabelText('Time Slot'));
      expect(screen.getByLabelText(/widen the group/i)).toBeInTheDocument();
    });

    it('sends expandGroupTimeWindow when the operator opts in', async () => {
      renderModal([grouped({ id: 'a' })]);
      fireEvent.click(screen.getByLabelText('Time Slot'));
      fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
      fireEvent.change(screen.getByLabelText('End time'), { target: { value: '15:00' } });
      fireEvent.click(screen.getByLabelText(/widen the group/i));
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost.mock.calls[0]![1].body.options).toMatchObject({
        expandGroupTimeWindow: true,
      });
    });

    it('drops a stale widen opt-in when Time Slot is unchecked and re-checked', async () => {
      renderModal([grouped({ id: 'a' })]);
      fireEvent.click(screen.getByLabelText('Time Slot'));
      fireEvent.click(screen.getByLabelText(/widen the group/i));
      // Abandon the edit, then come back to it.
      fireEvent.click(screen.getByLabelText('Time Slot'));
      fireEvent.click(screen.getByLabelText('Time Slot'));

      expect(screen.getByLabelText(/widen the group/i)).not.toBeChecked();

      fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
      fireEvent.change(screen.getByLabelText('End time'), { target: { value: '15:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost.mock.calls[0]![1].body.options?.expandGroupTimeWindow).toBeUndefined();
    });

    it('links the blocking group from the failure row', async () => {
      mockPost.mockResolvedValue({
        data: {
          data: {
            updated: 0,
            failed: [
              {
                id: 'a',
                code: 'APPOINTMENT_IN_SERVICE_GROUP',
                message:
                  'Date is managed by service group 36 — reschedule the group to move this appointment',
              },
            ],
          },
        },
        error: null,
      });
      renderModal([grouped({ id: 'a', code: 'AGE-0288' })]);
      fireEvent.click(screen.getByLabelText('Scheduled Date'));
      fireEvent.change(screen.getByLabelText('Set scheduled date'), {
        target: { value: FUTURE_DATE },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      fireEvent.click(await screen.findByRole('button', { name: /Show error details/ }));
      expect(screen.getByText('AGE-0288')).toBeInTheDocument();
      expect(screen.getByText(/Date is managed by service group 36/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /view group 36/i })).toHaveAttribute(
        'href',
        '/service-groups/sg-1',
      );
    });

    it('omits the group link for a failure on an ungrouped row', async () => {
      mockPost.mockResolvedValue({
        data: {
          data: {
            updated: 0,
            // Matches what the API now emits: the delegated past-date check
            // throws AppointmentDateInPastError, not the old inline DATE_IN_PAST.
            failed: [{ id: 'a', code: 'APPOINTMENT_DATE_IN_PAST', message: 'Scheduled date cannot be in the past' }],
          },
        },
        error: null,
      });
      renderModal([makeAppointment({ id: 'a', code: 'TST-0273' })]);
      fireEvent.click(screen.getByLabelText('Scheduled Date'));
      fireEvent.change(screen.getByLabelText('Set scheduled date'), {
        target: { value: FUTURE_DATE },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));

      fireEvent.click(await screen.findByRole('button', { name: /Show error details/ }));
      expect(screen.queryByRole('link', { name: /view group/i })).not.toBeInTheDocument();
    });
  });
});
