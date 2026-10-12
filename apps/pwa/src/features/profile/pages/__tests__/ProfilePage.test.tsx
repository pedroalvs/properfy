import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfilePage } from '../ProfilePage';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ProfilePage (menu)', () => {
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
      logout,
    });
  });

  it('renders the identity header with name and an Active badge', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole('heading', { name: 'Inspector Jane' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the menu rows pointing at the correct sub-routes', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', '/earnings');
    expect(screen.getByRole('link', { name: 'Availability' })).toHaveAttribute('href', '/profile/availability');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/profile/documents');
    expect(screen.getByRole('link', { name: 'Account details' })).toHaveAttribute('href', '/profile/account');
    expect(screen.getByRole('link', { name: 'App settings' })).toHaveAttribute('href', '/profile/settings');
  });

  it('logs out when the Log out row is pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('renders null when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null, logout });
    const { container } = renderWithProviders(<ProfilePage />);
    expect(container.firstChild).toBeNull();
  });
});
