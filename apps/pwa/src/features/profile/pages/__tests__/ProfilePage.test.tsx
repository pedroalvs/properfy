import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfilePage } from '../ProfilePage';

const mockUseAuth = vi.fn();
const mockUseInspectorMe = vi.fn();
const mockUseAvailability = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

vi.mock('../../hooks/useInspectorMe', () => ({
  useInspectorMe: () => mockUseInspectorMe(),
}));

vi.mock('../../hooks/useInspectorAvailabilityTemplate', () => ({
  useInspectorAvailabilityTemplate: () => mockUseAvailability(),
}));

describe('ProfilePage (tiles)', () => {
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
    mockUseInspectorMe.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockUseAvailability.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('renders the identity header with name and an Active badge', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole('heading', { name: 'Inspector Jane' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the four tiles pointing at the correct destinations', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', '/earnings');
    expect(screen.getByRole('link', { name: 'Availability' })).toHaveAttribute('href', '/profile/availability');
    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/profile/documents');
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', '/profile/account');
  });

  it('no longer surfaces App settings or Account details on the main screen', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.queryByRole('link', { name: 'App settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account details' })).not.toBeInTheDocument();
  });

  it('shows the rating and services count from the inspector record', () => {
    mockUseInspectorMe.mockReturnValue({
      data: { data: { rating: { average: 4.8, responseCount: 12, doneServicesCount: 132 } } },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('· 132 services')).toBeInTheDocument();
  });

  it('flags documents needing attention with a status label', () => {
    mockUseInspectorMe.mockReturnValue({
      // insurance expired → danger / "Action needed"
      data: {
        data: {
          insuranceFileKey: 'ins.pdf',
          insuranceExpiresAt: '2000-01-01',
          policeCheckFileKey: 'pc.pdf',
          policeCheckExpiresAt: '2999-01-01',
        },
      },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText('Action needed')).toBeInTheDocument();
  });

  it('summarises availability on the tile', () => {
    mockUseAvailability.mockReturnValue({
      data: {
        template: {
          mon: { am: true, pm: true },
          tue: { am: true, pm: true },
          wed: { am: true, pm: true },
          thu: { am: true, pm: true },
          fri: { am: true, pm: true },
          sat: { am: false, pm: false },
          sun: { am: false, pm: false },
        },
        overrides: {},
      },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText('Mon–Fri')).toBeInTheDocument();
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
