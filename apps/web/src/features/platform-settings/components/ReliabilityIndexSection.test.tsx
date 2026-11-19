import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { ReliabilityIndexSection } from './ReliabilityIndexSection';
import type { UsePlatformSettingReturn } from '../hooks/usePlatformSetting';

const mockHook = vi.fn<[], UsePlatformSettingReturn>();
vi.mock('../hooks/usePlatformSetting', () => ({ usePlatformSetting: () => mockHook() }));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) };
});

const DEFAULT_VALUE = {
  weights: { PUNCTUALITY: 1, GEOFENCE: 1, NO_STUCK: 1, SATISFACTION: 1, LATE_NOTICE: 1, CANT_ATTEND: 1, VOLUME: 1, DONE_REJECTED: 1 },
  minimumVolume: 10,
  volumeReferenceOverride: null,
  minimumRatings: 3,
};

function makeSetting(overrides: Partial<PlatformSettingResponse> = {}): PlatformSettingResponse {
  return {
    key: 'reliabilityIndex',
    section: 'Reliability index',
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
  invalidateQueries.mockReset();
});

describe('ReliabilityIndexSection', () => {
  it('loads all eleven fields from the setting', () => {
    setHook({});
    render(<ReliabilityIndexSection />);
    expect(screen.getByLabelText('Punctuality weight')).toHaveValue('1');
    expect(screen.getByLabelText('Accepted work weight')).toHaveValue('1');
    expect(screen.getByLabelText('Minimum services to be ranked')).toHaveValue('10');
    expect(screen.getByLabelText('Fixed volume reference (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Minimum ratings for satisfaction')).toHaveValue('3');
  });

  it('validates the field bounds with the exact messages', () => {
    setHook({});
    render(<ReliabilityIndexSection />);
    fireEvent.change(screen.getByLabelText('Punctuality weight'), { target: { value: '11' } });
    expect(screen.getByText('Enter a whole number from 0 to 10')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Minimum services to be ranked'), { target: { value: '0' } });
    expect(screen.getByText('Enter a whole number from 1 to 200')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fixed volume reference (optional)'), { target: { value: '1001' } });
    expect(screen.getByText('Enter a whole number from 1 to 1000, or leave it empty')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Minimum ratings for satisfaction'), { target: { value: '51' } });
    expect(screen.getByText('Enter a whole number from 1 to 50')).toBeInTheDocument();
  });

  it('rejects all-zero weights with the group message', () => {
    setHook({});
    render(<ReliabilityIndexSection />);
    for (const label of ['Punctuality', 'On-site check-ins', 'Finished within 6 hours', 'Tenant satisfaction', 'Late notice given', 'Attendance', 'Completed volume', 'Accepted work']) {
      fireEvent.change(screen.getByLabelText(`${label} weight`), { target: { value: '0' } });
    }
    expect(screen.getByText('Set at least one weight above 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves the full object, shows the snackbar and invalidates the ranking', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save });
    render(<ReliabilityIndexSection />);
    fireEvent.change(screen.getByLabelText('Punctuality weight'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      weights: { ...DEFAULT_VALUE.weights, PUNCTUALITY: 3 },
      minimumVolume: 10,
      volumeReferenceOverride: null,
      minimumRatings: 3,
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Reliability settings saved. Scores are being recalculated.'));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['reliability'] });
  });

  it('sends an empty override as null', async () => {
    const save = vi.fn().mockResolvedValue(makeSetting());
    setHook({ save, setting: makeSetting({ value: { ...DEFAULT_VALUE, volumeReferenceOverride: 20 } }) });
    render(<ReliabilityIndexSection />);
    fireEvent.change(screen.getByLabelText('Fixed volume reference (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0]).toMatchObject({ volumeReferenceOverride: null });
  });

  it('maps a 400 details response to a field error without a snackbar', async () => {
    const save = vi.fn().mockRejectedValue(
      new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', [{ field: 'minimumVolume', message: 'Server rejected it' }]),
    );
    setHook({ save });
    render(<ReliabilityIndexSection />);
    fireEvent.change(screen.getByLabelText('Minimum services to be ranked'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Server rejected it')).toBeInTheDocument());
    expect(showError).not.toHaveBeenCalled();
  });

  it('disables Save when there are no changes', () => {
    setHook({});
    render(<ReliabilityIndexSection />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('reports a 403 as an access error', () => {
    setHook({ isError: true, error: new ApiError(403, 'Forbidden', 'FORBIDDEN'), setting: null });
    render(<ReliabilityIndexSection />);
    expect(screen.getByText("You don't have access to platform settings")).toBeInTheDocument();
  });

  it('reports the dirty state to the parent', () => {
    setHook({});
    const onDirtyChange = vi.fn();
    render(<ReliabilityIndexSection onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText('Minimum ratings for satisfaction'), { target: { value: '5' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
