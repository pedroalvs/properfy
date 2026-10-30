import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileSettingsPage } from '../ProfileSettingsPage';

const mockUseInstallPrompt = vi.fn();

vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
  InstallPromptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

  it('places an empty push-preference slot as the first content child', () => {
    renderWithProviders(<ProfileSettingsPage />);
    const slot = screen.getByTestId('push-preference-slot');
    expect(slot).toBeEmptyDOMElement();
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
});
