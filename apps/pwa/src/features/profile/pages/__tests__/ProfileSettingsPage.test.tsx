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

  it('renders the install card and the version footer', () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByTestId('install-app-card')).toBeInTheDocument();
    expect(screen.getByText('Properfy Inspector v1.0')).toBeInTheDocument();
  });
});
