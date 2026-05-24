import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapGroupCreateModal } from './MapGroupCreateModal';

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
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
});
