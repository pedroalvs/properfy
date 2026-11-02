import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { PlatformSettingsPage } from './PlatformSettingsPage';
import type { UsePlatformSettingReturn } from '../hooks/usePlatformSetting';

const mockHook = vi.fn<[], UsePlatformSettingReturn>();
vi.mock('../hooks/usePlatformSetting', () => ({
  usePlatformSetting: () => mockHook(),
}));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), dismiss: vi.fn(), messages: [] }),
}));
// The preview block (query/auth providers) has its own test; stub it here so the
// page test stays about the sections and the discard-guard plumbing.
vi.mock('../components/RouteWeightsPreview', () => ({
  RouteWeightsPreview: () => <div data-testid="preview-stub" />,
}));

const VALUE = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

const setting: PlatformSettingResponse = {
  key: 'fieldEvents',
  section: 'Field events',
  value: { ...VALUE },
  defaults: { ...VALUE },
  isDefault: true,
  updatedAt: null,
  updatedBy: null,
};

function setHook(partial: Partial<UsePlatformSettingReturn> = {}) {
  mockHook.mockReturnValue({
    setting,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    save: vi.fn().mockResolvedValue(setting),
    isSaving: false,
    ...partial,
  });
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/dashboard', '/platform-settings']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/platform-settings" element={<PlatformSettingsPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-probe" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => mockHook.mockReset());

describe('PlatformSettingsPage', () => {
  it('renders the page header and the Field events section', () => {
    setHook();
    renderPage();
    expect(screen.getByRole('heading', { name: 'Platform settings' })).toBeInTheDocument();
    expect(screen.getByText('Field events')).toBeInTheDocument();
    expect(screen.getByLabelText('Geofence radius')).toBeInTheDocument();
  });

  it('renders Field events then Route planning (section order)', () => {
    setHook();
    renderPage();
    const fieldEvents = screen.getByText('Field events');
    const routePlanning = screen.getByText('Route planning');
    expect(routePlanning).toBeInTheDocument();
    // Field events comes before Route planning in document order.
    expect(fieldEvents.compareDocumentPosition(routePlanning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the access ErrorState when the setting read is forbidden', () => {
    setHook({ isError: true, error: new ApiError(403, 'Forbidden', 'FORBIDDEN'), setting: null });
    renderPage();
    // Both sections surface the forbidden state (each reads a key).
    expect(screen.getAllByText("You don't have access to platform settings").length).toBeGreaterThanOrEqual(1);
  });

  it('navigates back immediately when there are no unsaved changes', () => {
    setHook();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('dashboard-probe')).toBeInTheDocument();
  });

  it('prompts before leaving with unsaved changes and discards on confirm', () => {
    setHook();
    renderPage();
    // Make the form dirty.
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    // Does not navigate yet — a discard confirmation appears instead.
    expect(screen.queryByTestId('dashboard-probe')).not.toBeInTheDocument();
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByTestId('dashboard-probe')).toBeInTheDocument();
  });

  it('stays on the page when the discard prompt is cancelled', () => {
    setHook();
    renderPage();
    fireEvent.change(screen.getByLabelText('Geofence radius'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.queryByTestId('dashboard-probe')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platform settings' })).toBeInTheDocument();
  });
});
