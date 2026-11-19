import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlatformSettingResponse } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { PlatformSettingsPage } from './PlatformSettingsPage';
import type { UsePlatformSettingReturn } from '../hooks/usePlatformSetting';

const mockHook = vi.fn<[string], UsePlatformSettingReturn>();
vi.mock('../hooks/usePlatformSetting', () => ({
  usePlatformSetting: (key: string) => mockHook(key),
}));

const SECTION_BY_KEY: Record<string, string> = {
  fieldEvents: 'Field events',
  routeWeights: 'Route planning',
  tenantEtaNotices: 'Tenant arrival notices',
  liveDayAlerts: 'Live Day alerts',
  propertyFiles: 'Property files',
  inspectorProgram: 'Inspector program',
};
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
  // Key-aware: each section reads its own key, so give each its own section label
  // (the TenantEtaNoticesSection header comes from the response `section`).
  //
  // CRITICAL: cache one STABLE return object per key. The sections memoize
  // `loaded` on `setting` identity and run a `useEffect([loaded])` that calls
  // setState; returning a fresh object per call would churn that identity every
  // render → infinite re-render loop → heap blowout ("Worker exited unexpectedly").
  const cache = new Map<string, UsePlatformSettingReturn>();
  mockHook.mockImplementation((key: string) => {
    let value = cache.get(key);
    if (!value) {
      value = {
        setting: { ...setting, key, section: SECTION_BY_KEY[key] ?? setting.section },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        save: vi.fn().mockResolvedValue(setting),
        isSaving: false,
        ...partial,
      };
      cache.set(key, value);
    }
    return value;
  });
}

function renderPage() {
  // The Reliability index section uses useQueryClient (to invalidate the ranking
  // after save), so the page needs a QueryClient in tests.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/dashboard', '/platform-settings']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/platform-settings" element={<PlatformSettingsPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockHook.mockReset();
});

describe('PlatformSettingsPage', () => {
  it('renders the page header and the Field events section', () => {
    setHook();
    renderPage();
    expect(screen.getByRole('heading', { name: 'Platform settings' })).toBeInTheDocument();
    expect(screen.getByText('Field events')).toBeInTheDocument();
    expect(screen.getByLabelText('Geofence radius')).toBeInTheDocument();
  });

  it('renders Field events, Route planning, Tenant arrival notices then Live Day alerts (section order)', () => {
    setHook();
    renderPage();
    const fieldEvents = screen.getByText('Field events');
    const routePlanning = screen.getByText('Route planning');
    const tenantEta = screen.getByText('Tenant arrival notices');
    const liveDayAlerts = screen.getByText('Live Day alerts');
    expect(routePlanning).toBeInTheDocument();
    expect(tenantEta).toBeInTheDocument();
    expect(liveDayAlerts).toBeInTheDocument();
    // Field events → Route planning → Tenant arrival notices → Live Day alerts in document order.
    expect(fieldEvents.compareDocumentPosition(routePlanning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(routePlanning.compareDocumentPosition(tenantEta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tenantEta.compareDocumentPosition(liveDayAlerts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the Live Day alerts section with defaults 20/30 and its help text', () => {
    setHook();
    renderPage();
    expect(screen.getByLabelText('Delay alert (min)')).toHaveValue('20');
    expect(screen.getByLabelText('Not-started alert (min)')).toHaveValue('30');
    expect(
      screen.getByText(
        'Applies to every inspector without a custom limit. Changes show on the Live Day within a minute.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the Inspector program section with the default level thresholds', () => {
    setHook();
    renderPage();
    expect(screen.getByText('Inspector program')).toBeInTheDocument();
    expect(screen.getByLabelText('Silver from')).toHaveValue('60');
    expect(screen.getByLabelText('Gold from')).toHaveValue('85');
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
