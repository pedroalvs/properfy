import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { LiveDayAlertsSettingsSection } from './LiveDayAlertsSettingsSection';
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

const DEFAULT_VALUE = { delayMinutes: 20, notStartedMinutes: 30 };

function makeSetting(overrides: Partial<PlatformSettingResponse> = {}): PlatformSettingResponse {
  return {
    key: 'liveDayAlerts',
    section: 'Live Day alerts',
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

describe('LiveDayAlertsSettingsSection', () => {
  it('shows the section title, defaults 20/30 and the help text', () => {
    setHook({});
    render(<LiveDayAlertsSettingsSection />);
    expect(screen.getByText('Live Day alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('Delay alert (min)')).toHaveValue('20');
    expect(screen.getByLabelText('Not-started alert (min)')).toHaveValue('30');
    expect(
      screen.getByText(
        'Applies to every inspector without a custom limit. Changes show on the Live Day within a minute.',
      ),
    ).toBeInTheDocument();
  });

  it('validates the delay bounds (5–240)', () => {
    setHook({});
    render(<LiveDayAlertsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Delay alert (min)'), { target: { value: '4' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('validates the not-started bounds (5–240) and rejects decimals', () => {
    setHook({});
    render(<LiveDayAlertsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Not-started alert (min)'), { target: { value: '241' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Not-started alert (min)'), { target: { value: '12.5' } });
    expect(screen.getByText('Enter a value between 5 and 240 minutes.')).toBeInTheDocument();
  });

  it('saves the value as numbers and shows "Settings saved."', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save });
    render(<LiveDayAlertsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Delay alert (min)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ delayMinutes: 15, notStartedMinutes: 30 });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Settings saved.'));
  });

  it('maps a 400 details response to a field error', async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', [
          { field: 'delayMinutes', message: 'Server rejected it' },
        ]),
      );
    setHook({ save });
    render(<LiveDayAlertsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Delay alert (min)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Server rejected it')).toBeInTheDocument());
    expect(showError).not.toHaveBeenCalled();
  });

  it('restores the loaded values on Discard changes', () => {
    setHook({});
    render(<LiveDayAlertsSettingsSection />);
    const delay = screen.getByLabelText('Delay alert (min)');
    fireEvent.change(delay, { target: { value: '99' } });
    expect(delay).toHaveValue('99');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Delay alert (min)')).toHaveValue('20');
  });

  it('reports a 403 as an access error', () => {
    setHook({ isError: true, error: new ApiError(403, 'Forbidden', 'FORBIDDEN'), setting: null });
    render(<LiveDayAlertsSettingsSection />);
    expect(screen.getByText("You don't have access to platform settings")).toBeInTheDocument();
  });

  it('reports the dirty state to the parent', () => {
    setHook({});
    const onDirtyChange = vi.fn();
    render(<LiveDayAlertsSettingsSection onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText('Delay alert (min)'), { target: { value: '25' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
