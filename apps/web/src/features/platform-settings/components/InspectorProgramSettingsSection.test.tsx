import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_INSPECTOR_PROGRAM, type InspectorProgramSetting, type PlatformSettingResponse } from '@properfy/shared';
import { InspectorProgramSettingsSection } from './InspectorProgramSettingsSection';

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({ useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn() }) }));

vi.mock('../hooks/usePlatformSetting', () => ({ usePlatformSetting: vi.fn() }));
import { usePlatformSetting } from '../hooks/usePlatformSetting';
const mockHook = usePlatformSetting as unknown as Mock;

const save = vi.fn().mockResolvedValue({});

function setValue(value: InspectorProgramSetting, extra: Record<string, unknown> = {}) {
  const setting: PlatformSettingResponse = {
    key: 'inspectorProgram', section: 'Inspector program', value: value as unknown as Record<string, unknown>,
    defaults: DEFAULT_INSPECTOR_PROGRAM as unknown as Record<string, unknown>, isDefault: false, updatedAt: null, updatedBy: null,
  };
  mockHook.mockReturnValue({ setting, isLoading: false, isError: false, error: null, refetch: vi.fn(), save, isSaving: false, ...extra });
}

beforeEach(() => {
  showSuccess.mockReset();
  showError.mockReset();
  save.mockReset().mockResolvedValue({});
  mockHook.mockReset();
  setValue(DEFAULT_INSPECTOR_PROGRAM);
});

describe('InspectorProgramSettingsSection', () => {
  it('renders the levels, the off-by-default switch, window and minimum level', () => {
    render(<InspectorProgramSettingsSection />);
    expect(screen.getByLabelText('Silver from')).toHaveValue('60');
    expect(screen.getByLabelText('Gold from')).toHaveValue('85');
    const toggle = screen.getByRole('switch', { name: 'Early offer access' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Early access window (hours)')).toHaveValue('12');
    expect(screen.getByLabelText('Minimum level')).toBeInTheDocument();
    expect(
      screen.getByText('Only offers published after you turn this on are affected. Changing the window applies to offers already published.'),
    ).toBeInTheDocument();
  });

  it('rejects Gold ≤ Silver inline and disables save', () => {
    render(<InspectorProgramSettingsSection />);
    fireEvent.change(screen.getByLabelText('Gold from'), { target: { value: '50' } });
    expect(screen.getByText('Gold must be above Silver')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a window outside 1–72 hours', () => {
    render(<InspectorProgramSettingsSection />);
    fireEvent.change(screen.getByLabelText('Early access window (hours)'), { target: { value: '100' } });
    expect(screen.getByText('Enter a whole number from 1 to 72')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves the full object (echoing enabledAt) and shows the snackbar', async () => {
    render(<InspectorProgramSettingsSection />);
    fireEvent.change(screen.getByLabelText('Silver from'), { target: { value: '55' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      levels: { silverMinScore: 55, goldMinScore: 85 },
      earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null },
    });
    expect(showSuccess).toHaveBeenCalledWith('Inspector program settings saved.');
  });

  it('shows "On since" (Sydney) when early access is already on', () => {
    setValue({
      levels: { silverMinScore: 60, goldMinScore: 85 },
      earlyAccess: { enabled: true, hours: 12, minLevel: 'GOLD', enabledAt: '2026-11-01T00:00:00.000Z' },
    });
    render(<InspectorProgramSettingsSection />);
    expect(screen.getByText('On since 1 Nov 2026, 11:00 am')).toBeInTheDocument();
  });
});
