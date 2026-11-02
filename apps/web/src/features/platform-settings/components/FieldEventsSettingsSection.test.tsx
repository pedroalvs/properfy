import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { FieldEventsSettingsSection } from './FieldEventsSettingsSection';
import type { UsePlatformSettingReturn } from '../hooks/usePlatformSetting';

const mockHook = vi.fn<[], UsePlatformSettingReturn>();
vi.mock('../hooks/usePlatformSetting', () => ({
  usePlatformSetting: () => mockHook(),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));

const DEFAULT_VALUE = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

function makeSetting(overrides: Partial<PlatformSettingResponse> = {}): PlatformSettingResponse {
  return {
    key: 'fieldEvents',
    section: 'Field events',
    value: { ...DEFAULT_VALUE },
    defaults: { ...DEFAULT_VALUE },
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function setHook(partial: Partial<UsePlatformSettingReturn>) {
  mockHook.mockReturnValue({
    setting: makeSetting(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    save: vi.fn().mockResolvedValue(makeSetting()),
    isSaving: false,
    ...partial,
  });
}

beforeEach(() => {
  mockHook.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
});

describe('FieldEventsSettingsSection', () => {
  it('shows the section title, the loaded values and the Default badge', () => {
    setHook({ setting: makeSetting({ isDefault: true }) });
    render(<FieldEventsSettingsSection />);
    expect(screen.getByText('Field events')).toBeInTheDocument();
    expect(screen.getByLabelText('Geofence radius')).toHaveValue('300');
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows who last changed it when not a default', () => {
    setHook({
      setting: makeSetting({
        isDefault: false,
        updatedAt: '2026-11-03T10:00:00+11:00',
        updatedBy: { id: 'u-1', name: 'Ana Ops' },
      }),
    });
    render(<FieldEventsSettingsSection />);
    expect(screen.getByText(/Last changed by Ana Ops on/)).toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('validates the geofence radius bounds', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '49' } });
    expect(screen.getByText('Enter a radius between 50 and 5000 m')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('validates the time window tolerance bounds', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Time window tolerance'), { target: { value: '241' } });
    expect(screen.getByText('Enter 0 to 240 minutes')).toBeInTheDocument();
  });

  it('validates the reminder minutes bounds', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Remind after window end'), { target: { value: '721' } });
    expect(screen.getByText('Enter 0 to 720 minutes')).toBeInTheDocument();
  });

  it('shows the Block fallback help text when Block is selected', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    expect(screen.queryByText(/There is no per-job override/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Block'));
    expect(screen.getByText(/There is no per-job override/)).toBeInTheDocument();
  });

  it('disables the reminder minutes field when the reminder switch is off', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    expect(screen.getByLabelText('Remind after window end')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Send a reminder to the inspector'));
    expect(screen.getByLabelText('Remind after window end')).toBeDisabled();
  });

  it('saves the complete value object and shows the success snackbar', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save });
    render(<FieldEventsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '250' } });
    fireEvent.click(screen.getByLabelText('Block'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      geofenceRadiusMeters: 250,
      geofenceMode: 'BLOCK',
      checkInWindowToleranceMinutes: 15,
      completionReminderEnabled: true,
      completionReminderMinutesAfterWindowEnd: 30,
    });
    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith('Field event settings saved. Changes apply within a minute.'),
    );
  });

  it('maps a 400 details response to field errors and focuses the first', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', [
          { field: 'geofenceRadiusMeters', message: 'Server says too small' },
        ]),
      );
    setHook({ save });
    render(<FieldEventsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Server says too small')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Geofence radius')).toHaveFocus());
    expect(showError).not.toHaveBeenCalled();
  });

  it('restores the loaded values on Discard changes', () => {
    setHook({});
    render(<FieldEventsSettingsSection />);
    const radius = screen.getByLabelText('Geofence radius');
    fireEvent.change(radius, { target: { value: '500' } });
    expect(radius).toHaveValue('500');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Geofence radius')).toHaveValue('300');
  });

  it('reports a 403 as an access error', () => {
    setHook({ isError: true, error: new ApiError(403, 'Forbidden', 'FORBIDDEN'), setting: null });
    render(<FieldEventsSettingsSection />);
    expect(screen.getByText("You don't have access to platform settings")).toBeInTheDocument();
  });

  it('reports the dirty state to the parent', () => {
    setHook({});
    const onDirtyChange = vi.fn();
    render(<FieldEventsSettingsSection onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '500' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
