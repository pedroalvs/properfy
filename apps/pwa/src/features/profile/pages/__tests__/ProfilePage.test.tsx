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

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

describe('ProfilePage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'insp-1',
        name: 'Inspector Jane',
        email: 'jane@test.com',
        role: 'INSP',
        tenantId: null,
        status: 'ACTIVE',
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

  it('renders account hub with security sections', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getAllByText('Inspector Jane').length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@test.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+5511999999999').length).toBeGreaterThan(0);
    expect(screen.getByText('Account Status')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.getAllByText(/managed by your operations team/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Log Out')).toBeInTheDocument();
  });
});
