import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { TenantEtaNoticesSection } from './TenantEtaNoticesSection';
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
  enabled: false,
  channelMode: 'BOTH',
  morningHour: 7,
  morningCutoffHour: 9,
  delayThresholdMinutes: 20,
  smsBudgetSharePercent: 80,
};

function makeSetting(overrides: Partial<PlatformSettingResponse> = {}): PlatformSettingResponse {
  return {
    key: 'tenantEtaNotices',
    section: 'Tenant arrival notices',
    value: { ...DEFAULT_VALUE },
    defaults: { ...DEFAULT_VALUE },
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function setHook(partial: Partial<UsePlatformSettingReturn> = {}) {
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

describe('TenantEtaNoticesSection', () => {
  it('renders the section header from the response and the defaults', () => {
    setHook();
    render(<TenantEtaNoticesSection />);
    expect(screen.getByText('Tenant arrival notices')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Channels')).toHaveTextContent('SMS and email');
    expect(screen.getByLabelText('Morning notice at')).toHaveTextContent('7:00 am');
    expect(screen.getByLabelText("Don't send the morning notice after")).toHaveTextContent('9:00 am');
    expect(screen.getByLabelText('Running-late threshold')).toHaveValue('20');
  });

  it('saves the full object with a changed threshold and shows the success snackbar', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save });
    render(<TenantEtaNoticesSection />);
    fireEvent.change(screen.getByLabelText('Running-late threshold'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      enabled: false,
      channelMode: 'BOTH',
      morningHour: 7,
      morningCutoffHour: 9,
      delayThresholdMinutes: 35,
      smsBudgetSharePercent: 80,
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Settings saved'));
  });

  it('blocks save with an inline error when the cutoff is not after the morning hour', async () => {
    setHook();
    render(<TenantEtaNoticesSection />);
    // Default morning 7:00 am, cutoff 9:00 am. Move the morning hour to 10:00 am
    // so the cutoff (9:00 am) is no longer after it.
    fireEvent.click(screen.getByLabelText('Morning notice at'));
    fireEvent.click(screen.getByRole('option', { name: '10:00 am' }));
    await waitFor(() =>
      expect(screen.getByText('Must be after the morning notice hour')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the bounds error for an out-of-range threshold', async () => {
    setHook();
    render(<TenantEtaNoticesSection />);
    fireEvent.change(screen.getByLabelText('Running-late threshold'), { target: { value: '121' } });
    await waitFor(() =>
      expect(screen.getByText('Enter a number between 5 and 120')).toBeInTheDocument(),
    );
  });

  it('surfaces a server 422 field error', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiError(422, 'Invalid', 'VALIDATION_ERROR', [
        { field: 'smsBudgetSharePercent', message: 'Enter a number between 10 and 100' },
      ]),
    );
    setHook({ save });
    render(<TenantEtaNoticesSection />);
    fireEvent.change(screen.getByLabelText('Running-late threshold'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('Enter a number between 10 and 100')).toBeInTheDocument(),
    );
  });

  it('shows the fixed ±30-minute range note', () => {
    setHook();
    render(<TenantEtaNoticesSection />);
    expect(
      screen.getByText('Estimates are shown as a 1-hour range (±30 minutes), limited to the booked window.'),
    ).toBeInTheDocument();
  });
});
