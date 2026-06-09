import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapGroupCreateModal } from './MapGroupCreateModal';
import { api } from '@/services/api';

// Stable references so individual tests can assert on showError/showSuccess calls.
// Vitest allows mock-prefixed variables to be referenced inside vi.mock() factories.
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: () => ({
    options: [
      { value: 'st-1', label: 'Routine Inspection' },
      { value: 'st-2', label: 'Ingoing Inspection' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/services/api', () => ({
  api: { POST: vi.fn().mockResolvedValue({ data: {} }) },
}));

vi.mock('./RegionSelector', () => ({
  RegionSelector: ({ onRegionChange }: { onRegionChange: (v: string) => void }) => (
    <button data-testid="region-selector" onClick={() => onRegionChange('region-1')}>
      Select Region
    </button>
  ),
}));

vi.mock('./TimeWindowPicker', () => ({
  TimeWindowPicker: ({
    startTime,
    endTime,
    onStartTimeChange,
    onEndTimeChange,
  }: {
    startTime: string;
    endTime: string;
    onStartTimeChange: (v: string) => void;
    onEndTimeChange: (v: string) => void;
  }) => (
    <div data-testid="time-window-picker">
      <input value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} data-testid="start-time" />
      <input value={endTime} onChange={(e) => onEndTimeChange(e.target.value)} data-testid="end-time" />
    </div>
  ),
}));

vi.mock('./PriorityModeSelect', () => ({
  PriorityModeSelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select data-testid="priority-mode" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="STANDARD">Standard</option>
    </select>
  ),
}));

beforeEach(() => {
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  vi.mocked(api.POST).mockResolvedValue({ data: {} } as any);
});

function renderModal(props: Partial<React.ComponentProps<typeof MapGroupCreateModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MapGroupCreateModal
        open={true}
        onClose={vi.fn()}
        selectedAppointments={[
          { id: 'apt-1', code: 'INS-0001', status: 'DRAFT', propertyAddress: '1 Test St', latitude: 0, longitude: 0, scheduledDate: '2026-07-01', timeSlot: '09:00-10:00', inspectorName: null, branchName: 'Br', tenantId: 'tenant-1', clientName: 'Acme' },
          { id: 'apt-2', code: 'INS-0002', status: 'DRAFT', propertyAddress: '2 Test St', latitude: 0, longitude: 0, scheduledDate: '2026-07-01', timeSlot: '09:00-10:00', inspectorName: null, branchName: 'Br', tenantId: 'tenant-1', clientName: 'Acme' },
        ]}
        onSuccess={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('MapGroupCreateModal', () => {
  it('renders with appointment count in title', () => {
    renderModal();
    expect(screen.getByText(/Create Service Group \(2 appointments\)/)).toBeInTheDocument();
  });

  it('renders required form fields', () => {
    renderModal();
    expect(screen.getByText('Service Type')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getByText('Time Window')).toBeInTheDocument();
    expect(screen.getByText('Service Region')).toBeInTheDocument();
  });

  it('renders cancel and create buttons', () => {
    renderModal();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create Group')).toBeInTheDocument();
  });

  it('hides the region selector and shows a note for a mixed-agency selection', () => {
    renderModal({
      selectedAppointments: [
        { id: 'apt-1', code: 'INS-0001', status: 'DRAFT', propertyAddress: '1 Test St', latitude: 0, longitude: 0, scheduledDate: '2026-07-01', timeSlot: '09:00-10:00', inspectorName: null, branchName: 'Br', tenantId: 'tenant-1', clientName: 'Acme' },
        { id: 'apt-2', code: 'INS-0002', status: 'DRAFT', propertyAddress: '2 Test St', latitude: 0, longitude: 0, scheduledDate: '2026-07-01', timeSlot: '09:00-10:00', inspectorName: null, branchName: 'Br', tenantId: 'tenant-2', clientName: 'Globex' },
      ] as any,
    });
    expect(screen.queryByTestId('region-selector')).not.toBeInTheDocument();
    expect(screen.getByText(/spans 2 agencies/i)).toBeInTheDocument();
  });

  it('create button is disabled when required fields (service type, date) are empty', () => {
    renderModal();
    const createBtn = screen.getByText('Create Group').closest('button');
    expect(createBtn).toBeDisabled();
  });

  it('create button is enabled when service type and date are filled even without a region', () => {
    // 026 BUG-004: region is optional at creation (spec 005 FR-007).
    // The submit button must NOT be gated on serviceRegionId.
    //
    // SelectInput is a custom dropdown (not a native <select>), so we
    // interact with it via click — open the trigger, then click the option.
    renderModal();

    // Open the Service Type dropdown (the first button with aria-haspopup).
    const serviceTypeTrigger = screen.getAllByRole('button', { name: /select\.\.\./i })[0]
      ?? screen.getAllByRole('button').find((b) => b.getAttribute('aria-haspopup') === 'listbox');
    fireEvent.click(serviceTypeTrigger!);
    // Pick "Routine Inspection".
    fireEvent.click(screen.getByText('Routine Inspection'));

    // Fill scheduled date via the type="date" input (unique in the modal).
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-01' } });

    // Region is still empty — button must be enabled.
    const createBtn = screen.getByText('Create Group').closest('button');
    expect(createBtn).not.toBeDisabled();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when open is false', () => {
    renderModal({ open: false });
    expect(screen.queryByText(/Create Service Group/)).not.toBeInTheDocument();
  });

  // --- Core fix coverage (fix/group-creation) ---

  it('calls showError and does NOT call showSuccess when api.POST returns an error envelope', async () => {
    vi.mocked(api.POST).mockResolvedValueOnce({
      error: { error: { message: 'All appointments must have the same service type', code: 'SERVICE_TYPE_MISMATCH' } },
    } as any);

    // 5 appointments with same serviceTypeId (valid UUID) so the standard-size check passes.
    // serviceTypeId must be a UUID — createServiceGroupSchema enforces z.string().uuid().
    const ST_UUID = 'aaaaaaaa-0000-4000-8000-000000000099';
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `aaaaaaaa-0000-4000-8000-00000000000${i + 1}`,
      code: `INS-000${i + 1}`,
      status: 'DRAFT' as const,
      propertyAddress: `${i + 1} Test St`,
      latitude: 0,
      longitude: 0,
      scheduledDate: '2026-07-01',
      timeSlot: '09:00-10:00',
      inspectorName: null,
      branchName: 'Br',
      tenantId: 'tenant-1',
      clientName: 'Acme',
      serviceTypeId: ST_UUID,
    }));

    renderModal({ selectedAppointments: five });

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-15' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Create Group'));
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('All appointments must have the same service type');
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('shows service type as read-only display (not a dropdown) when inferred from appointments', () => {
    renderModal({
      selectedAppointments: [
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000010',
          code: 'INS-0010',
          status: 'DRAFT',
          propertyAddress: '1 Test St',
          latitude: 0,
          longitude: 0,
          scheduledDate: '2026-07-01',
          timeSlot: '09:00-10:00',
          inspectorName: null,
          branchName: 'Br',
          tenantId: 'tenant-1',
          clientName: 'Acme',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Routine Inspection',
        },
      ],
    });

    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getByText('(from appointments)')).toBeInTheDocument();
    // The editable dropdown must not be rendered when the type is inferred.
    expect(screen.queryByRole('button', { name: /select\.\.\./i })).toBeNull();
  });

  it('updates the service type label when appointments change (useEffect resync)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const makeAppt = (id: string, code: string, serviceTypeId: string, serviceTypeName: string) => ({
      id,
      code,
      status: 'DRAFT' as const,
      propertyAddress: '1 Test St',
      latitude: 0,
      longitude: 0,
      scheduledDate: '2026-07-01',
      timeSlot: '09:00-10:00',
      inspectorName: null,
      branchName: 'Br',
      tenantId: 'tenant-1',
      clientName: 'Acme',
      serviceTypeId,
      serviceTypeName,
    });

    type Appt = ReturnType<typeof makeAppt>;
    const Wrapper = ({ appointments }: { appointments: Appt[] }) => (
      <QueryClientProvider client={queryClient}>
        <MapGroupCreateModal open selectedAppointments={appointments} onClose={vi.fn()} onSuccess={vi.fn()} />
      </QueryClientProvider>
    );

    const appt1 = makeAppt('aaaaaaaa-0000-4000-8000-000000000020', 'INS-0020', 'st-1', 'Routine Inspection');
    const appt2 = makeAppt('aaaaaaaa-0000-4000-8000-000000000021', 'INS-0021', 'st-2', 'Outgoing Inspection');

    const { rerender } = render(<Wrapper appointments={[appt1]} />);
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();

    rerender(<Wrapper appointments={[appt2]} />);
    expect(screen.getByText('Outgoing Inspection')).toBeInTheDocument();
    expect(screen.queryByText('Routine Inspection')).not.toBeInTheDocument();
  });
});
