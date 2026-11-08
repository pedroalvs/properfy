import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';

const save = vi.fn();
const settingState = {
  setting: {
    key: 'propertyFiles',
    section: 'Property files',
    value: { ...DEFAULT_PROPERTY_FILES_SETTING },
    defaults: { ...DEFAULT_PROPERTY_FILES_SETTING },
    isDefault: true,
    updatedAt: null,
    updatedBy: null,
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  save,
  isSaving: false,
};
vi.mock('../hooks/usePlatformSetting', () => ({ usePlatformSetting: () => settingState }));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showError, showSuccess, showInfo: vi.fn() }),
}));

import { PropertyFilesSettingsSection } from './PropertyFilesSettingsSection';

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined);
  showError.mockReset();
  showSuccess.mockReset();
});

describe('PropertyFilesSettingsSection', () => {
  it('loads the current values', () => {
    render(<PropertyFilesSettingsSection />);
    expect(screen.getByLabelText('Max file size in MB')).toHaveValue('20');
    expect(screen.getByLabelText('Max photos per issue')).toHaveValue('10');
    // retention "keep forever" → the days field is hidden by default
    expect(screen.queryByLabelText('Delete active files after days')).not.toBeInTheDocument();
  });

  it('saves a valid, dirty change with the full value object', async () => {
    render(<PropertyFilesSettingsSection />);
    fireEvent.change(screen.getByLabelText('Max file size in MB'), { target: { value: '30' } });
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ maxFileSizeMb: 30, deletedRetentionDays: 365, retentionDays: null });
  });

  it('blocks saving an out-of-bounds value', () => {
    render(<PropertyFilesSettingsSection />);
    fireEvent.change(screen.getByLabelText('Max file size in MB'), { target: { value: '3' } });
    expect(screen.getByText('Enter a number between 5 and 200')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
