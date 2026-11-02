import type * as ReactRouterDom from 'react-router-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileSettingsPage } from '../ProfileSettingsPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseInstallPrompt = vi.fn();

vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
  InstallPromptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The push control's effects are covered in its own suite; here we only verify
// it fills the reserved slot above the install card.
vi.mock('@/features/push/hooks/useBrowserPushDeps', () => ({ useBrowserPushDeps: () => ({}) }));
vi.mock('@/features/push/hooks/usePushSubscription', () => ({
  usePushSubscription: () => ({ state: 'off', error: null, enable: vi.fn(), disable: vi.fn() }),
}));

describe('ProfileSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInstallPrompt.mockReturnValue({
      canInstall: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });
  });

  it('renders the install card', () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByTestId('install-app-card')).toBeInTheDocument();
  });

  it('shows the build version footer', () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByText(`Properfy Inspector v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it('fills the push-preference slot with the push control as the first content child', () => {
    renderWithProviders(<ProfileSettingsPage />);
    const slot = screen.getByTestId('push-preference-slot');
    expect(slot).not.toBeEmptyDOMElement();
    expect(slot).toContainElement(screen.getByRole('switch', { name: 'Push notifications' }));
    expect(slot.parentElement?.firstElementChild).toBe(slot);
  });

  it('orders the content as slot → install card → version footer', () => {
    renderWithProviders(<ProfileSettingsPage />);
    const slot = screen.getByTestId('push-preference-slot');
    const card = screen.getByTestId('install-app-card');
    const footer = screen.getByText(`Properfy Inspector v${__APP_VERSION__}`);
    expect(slot.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('replays the tour from "Show app tour" via /today without changing state', () => {
    renderWithProviders(<ProfileSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show app tour' }));
    expect(mockNavigate).toHaveBeenCalledWith('/today', { state: { replayTour: true } });
  });
});
