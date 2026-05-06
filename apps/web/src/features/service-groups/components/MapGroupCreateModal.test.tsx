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
        selectedAppointmentIds={['apt-1', 'apt-2']}
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

  it('create button is disabled when required fields are empty', () => {
    renderModal();
    const createBtn = screen.getByText('Create Group').closest('button');
    expect(createBtn).toBeDisabled();
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
