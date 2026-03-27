import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfilePage } from '../ProfilePage';

const mockUseAuth = vi.fn();
const mockUseInstallPrompt = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/app/useInstallPrompt', () => ({
  useInstallPrompt: () => mockUseInstallPrompt(),
  InstallPromptProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'insp-1',
        name: 'Inspector Jane',
        email: 'jane@test.com',
        role: 'INSP',
        tenantId: null,
        phone: '+5511999999999',
        totpEnabled: true,
        lastLoginAt: '2026-03-24T10:00:00Z',
      },
      logout: vi.fn(),
    });
    mockUseInstallPrompt.mockReturnValue({
      canInstall: false,
      isInstalled: false,
      promptInstall: vi.fn(),
    });
  });

  it('renders enriched profile information', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getAllByText('Inspector Jane').length).toBeGreaterThan(0);
    expect(screen.getByText('+5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });
});
