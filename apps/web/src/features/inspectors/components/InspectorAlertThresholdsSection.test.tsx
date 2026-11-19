import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { InspectorAlertThresholdsResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { InspectorAlertThresholdsSection } from './InspectorAlertThresholdsSection';
import type { UseInspectorAlertThresholdsReturn } from '../hooks/useInspectorAlertThresholds';

const useThresholdsMock = vi.fn();
vi.mock('../hooks/useInspectorAlertThresholds', () => ({
  useInspectorAlertThresholds: (...args: unknown[]) => useThresholdsMock(...args),
}));

let role = 'AM';
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role } }),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));

function thresholds(over: Partial<InspectorAlertThresholdsResponse> = {}): InspectorAlertThresholdsResponse {
  return {
    inspectorId: 'insp-1',
    platformDefaults: { delayMinutes: 20, notStartedMinutes: 30 },
    override: { delayMinutes: null, notStartedMinutes: null },
    effective: { delayMinutes: 20, notStartedMinutes: 30 },
    ...over,
  };
}

function setHook(partial: Partial<UseInspectorAlertThresholdsReturn> = {}) {
  useThresholdsMock.mockReturnValue({
    data: thresholds(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    save: vi.fn().mockResolvedValue(thresholds()),
    isSaving: false,
    ...partial,
  });
}

beforeEach(() => {
  role = 'AM';
  useThresholdsMock.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
});

describe('InspectorAlertThresholdsSection', () => {
  it('renders for AM/OP and enables the hook', () => {
    setHook();
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    expect(screen.getByText('Live Day alerts')).toBeInTheDocument();
    expect(useThresholdsMock).toHaveBeenCalledWith('insp-1', { enabled: true });
  });

  it('does not render for CL_ADMIN and disables the hook', () => {
    role = 'CL_ADMIN';
    setHook();
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    expect(screen.queryByText('Live Day alerts')).not.toBeInTheDocument();
    expect(useThresholdsMock).toHaveBeenCalledWith('insp-1', { enabled: false });
  });

  it('shows the effective values with the platform-default / custom suffixes', () => {
    setHook({
      data: thresholds({
        override: { delayMinutes: 15, notStartedMinutes: null },
        effective: { delayMinutes: 15, notStartedMinutes: 30 },
      }),
    });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    expect(screen.getByText('Delay alert after')).toBeInTheDocument();
    expect(screen.getByText('15 min (custom)')).toBeInTheDocument();
    expect(screen.getByText('Not-started alert after')).toBeInTheDocument();
    expect(screen.getByText('30 min (platform default)')).toBeInTheDocument();
  });

  it('opens the edit form with two fields and per-field default checkboxes, focusing the first field', async () => {
    setHook({
      data: thresholds({
        override: { delayMinutes: 15, notStartedMinutes: 25 },
        effective: { delayMinutes: 15, notStartedMinutes: 25 },
      }),
    });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Delay alert after (min)')).toBeInTheDocument();
    expect(screen.getByLabelText('Not-started alert after (min)')).toBeInTheDocument();
    expect(screen.getByLabelText('Use platform default (20 min)')).toBeInTheDocument();
    expect(screen.getByLabelText('Use platform default (30 min)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Delay alert after (min)')).toHaveFocus());
  });

  it('validates out-of-range, empty and decimal values', () => {
    setHook({
      data: thresholds({
        override: { delayMinutes: 15, notStartedMinutes: null },
        effective: { delayMinutes: 15, notStartedMinutes: 30 },
      }),
    });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const delay = screen.getByLabelText('Delay alert after (min)');

    fireEvent.change(delay, { target: { value: '4' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
    fireEvent.change(delay, { target: { value: '' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
    fireEvent.change(delay, { target: { value: '12.5' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables a field when its "use platform default" box is checked', () => {
    setHook({
      data: thresholds({
        override: { delayMinutes: 15, notStartedMinutes: 25 },
        effective: { delayMinutes: 15, notStartedMinutes: 25 },
      }),
    });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Delay alert after (min)')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Use platform default (20 min)'));
    expect(screen.getByLabelText('Delay alert after (min)')).toBeDisabled();
  });

  it('saves { delayMinutes, notStartedMinutes:null } and returns to the read view with the Edit focused', async () => {
    const save = vi.fn().mockResolvedValue(thresholds());
    setHook({ save });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // Default state is both-defaults; turn the delay into a custom 15.
    fireEvent.click(screen.getByLabelText('Use platform default (20 min)'));
    fireEvent.change(screen.getByLabelText('Delay alert after (min)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ delayMinutes: 15, notStartedMinutes: null }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Alert limits saved.'));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus());
  });

  it('shows the server message in an alert and keeps the values on a 400', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(400, 'Delay is too low for this inspector', 'VALIDATION_ERROR'));
    setHook({ save });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByLabelText('Use platform default (20 min)'));
    fireEvent.change(screen.getByLabelText('Delay alert after (min)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Delay is too low for this inspector'));
    // Still in edit mode, value kept.
    expect(screen.getByLabelText('Delay alert after (min)')).toHaveValue('15');
  });

  it('shows "This inspector no longer exists." on a 404', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(404, 'Not found', 'NOT_FOUND'));
    setHook({ save });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByLabelText('Use platform default (20 min)'));
    fireEvent.change(screen.getByLabelText('Delay alert after (min)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This inspector no longer exists.'));
  });

  it('discards on Cancel and on Escape, returning to the read view', () => {
    setHook({
      data: thresholds({
        override: { delayMinutes: 15, notStartedMinutes: null },
        effective: { delayMinutes: 15, notStartedMinutes: 30 },
      }),
    });
    render(<InspectorAlertThresholdsSection inspectorId="insp-1" />);
    // Cancel.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Delay alert after (min)'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('15 min (custom)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delay alert after (min)')).not.toBeInTheDocument();

    // Escape.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.keyDown(screen.getByLabelText('Delay alert after (min)'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Delay alert after (min)')).not.toBeInTheDocument();
  });
});
