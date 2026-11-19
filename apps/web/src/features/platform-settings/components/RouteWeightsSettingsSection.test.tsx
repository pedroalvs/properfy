import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { RouteWeightsSettingsSection } from './RouteWeightsSettingsSection';
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

// The preview block is covered by its own test; stub it so this test needs no
// query/auth providers.
vi.mock('./RouteWeightsPreview', () => ({
  RouteWeightsPreview: () => <div data-testid="preview-stub" />,
}));

const DEFAULT_VALUE = { travel: 1, windowWait: 1, baseProximity: 1 };

function makeSetting(overrides: Partial<PlatformSettingResponse> = {}): PlatformSettingResponse {
  return {
    key: 'routeWeights',
    section: 'Route planning',
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

describe('RouteWeightsSettingsSection', () => {
  it('renders the three weights at 1/1/1 with a Default badge', () => {
    setHook({ setting: makeSetting({ isDefault: true }) });
    render(<RouteWeightsSettingsSection />);
    expect(screen.getByText('Route planning')).toBeInTheDocument();
    expect(screen.getByLabelText('Driving time')).toHaveValue('1');
    expect(screen.getByLabelText('Waiting for windows')).toHaveValue('1');
    expect(screen.getByLabelText('Starting near the base')).toHaveValue('1');
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows the per-field error for an invalid weight', () => {
    setHook();
    render(<RouteWeightsSettingsSection />);
    // -1 (negative), 10.5 (>10), 0.15 (two decimals) are all invalid.
    fireEvent.change(screen.getByLabelText('Driving time'), { target: { value: '-1' } });
    expect(screen.getAllByText('Enter a number from 0 to 10 with at most one decimal place').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Driving time'), { target: { value: '10.5' } });
    expect(screen.getAllByText('Enter a number from 0 to 10 with at most one decimal place').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Driving time'), { target: { value: '0.15' } });
    expect(screen.getAllByText('Enter a number from 0 to 10 with at most one decimal place').length).toBeGreaterThan(0);
  });

  it('shows the group error when all three weights are 0', () => {
    setHook();
    render(<RouteWeightsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Driving time'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Waiting for windows'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Starting near the base'), { target: { value: '0' } });
    expect(screen.getByText('At least one weight must be greater than 0')).toBeInTheDocument();
  });

  it('saves the three weights and shows the success snackbar', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save });
    render(<RouteWeightsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Waiting for windows'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ travel: 1, windowWait: 0, baseProximity: 1 }));
    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith('Route weights saved. They apply to the next route calculation.'),
    );
  });

  it('discards unsaved changes back to the loaded values', () => {
    setHook();
    render(<RouteWeightsSettingsSection />);
    fireEvent.change(screen.getByLabelText('Driving time'), { target: { value: '7' } });
    expect(screen.getByLabelText('Driving time')).toHaveValue('7');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Driving time')).toHaveValue('1');
  });

  it('shows the access ErrorState when forbidden', () => {
    setHook({ isError: true, error: new ApiError(403, 'Forbidden', 'FORBIDDEN'), setting: null });
    render(<RouteWeightsSettingsSection />);
    expect(screen.getByText("You don't have access to platform settings")).toBeInTheDocument();
  });
});
