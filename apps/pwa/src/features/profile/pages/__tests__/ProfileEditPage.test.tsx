import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfileEditPage } from '../ProfileEditPage';

const mockUseAuth = vi.fn();
const mockMutateInspectorSelf = vi.fn();
const mockMutateAvailability = vi.fn();
const mockMutateTimezone = vi.fn();
const mockUsePrompt = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), PATCH: vi.fn(), PUT: vi.fn() },
}));

vi.mock('../../hooks/useUpdateInspectorSelf', () => ({
  useUpdateInspectorSelf: () => ({
    mutateAsync: mockMutateInspectorSelf,
    isPending: false,
    isError: false,
  }),
}));

vi.mock('../../hooks/useUpdateInspectorAvailabilityTemplate', () => ({
  useUpdateInspectorAvailabilityTemplate: () => ({
    mutateAsync: mockMutateAvailability,
    isPending: false,
    isError: false,
  }),
}));

vi.mock('../../hooks/useInspectorAvailabilityTemplate', () => ({
  useInspectorAvailabilityTemplate: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('../../hooks/useUpdateMyTimezone', () => ({
  useUpdateMyTimezone: () => ({
    mutateAsync: mockMutateTimezone,
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/lib/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUsePrompt(isDirty),
}));

const MOCK_USER = {
  id: 'user-1',
  inspectorId: 'insp-1',
  name: 'Diego Santos',
  email: 'diego@test.com',
  role: 'INSP',
  tenantId: null,
  status: 'ACTIVE',
  phone: '+61412345678',
  totpEnabled: false,
  lastLoginAt: null,
  inspectorPhotoUrl: null,
  timezone: 'Australia/Brisbane',
  personalTimezone: 'Australia/Brisbane',
};

describe('ProfileEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: vi.fn() });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('renders the three edit sections (photo, phone, availability)', () => {
    renderWithProviders(<ProfileEditPage />);
    // Phone section
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    // Availability section heading
    expect(screen.getAllByText('Availability').length).toBeGreaterThanOrEqual(1);
    // Photo/avatar section
    expect(screen.getByTestId('avatar-upload-section')).toBeInTheDocument();
  });

  it('calls useUnsavedChangesPrompt with aggregated dirty state', () => {
    renderWithProviders(<ProfileEditPage />);
    // Initially not dirty — prompt called with false
    expect(mockUsePrompt).toHaveBeenCalledWith(false);
  });

  it('renders null when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, logout: vi.fn(), refreshUser: vi.fn() });
    const { container } = renderWithProviders(<ProfileEditPage />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ProfileEditPage — AU phone mask and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: vi.fn() });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('displays the stored E.164 phone in local masked format', () => {
    renderWithProviders(<ProfileEditPage />);
    expect(screen.getByLabelText(/phone/i)).toHaveValue('0412 345 678');
  });

  it('is not dirty when the stored phone equals its formatted seed', () => {
    renderWithProviders(<ProfileEditPage />);
    expect(mockUsePrompt).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: /save phone/i })).not.toBeInTheDocument();
  });

  it('applies the mask while typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileEditPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '0498765432');
    expect(input).toHaveValue('0498 765 432');
  });

  it('blocks save and shows an error for an invalid AU phone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileEditPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '12345');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(screen.getByText(/valid australian phone/i)).toBeInTheDocument();
    expect(mockMutateInspectorSelf).not.toHaveBeenCalled();
  });

  it('saves a valid local number', async () => {
    mockMutateInspectorSelf.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ProfileEditPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '0498 765 432');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(mockMutateInspectorSelf).toHaveBeenCalledWith({ phone: '0498 765 432' });
  });

  it('shows the local placeholder', () => {
    renderWithProviders(<ProfileEditPage />);
    expect(screen.getByPlaceholderText('0412 345 678')).toBeInTheDocument();
  });
});

describe('ProfileEditPage — Timezone section', () => {
  const mockRefreshUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: mockRefreshUser });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('renders the picker prefilled from the personal timezone', () => {
    renderWithProviders(<ProfileEditPage />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent(/Brisbane \(GMT\+\d+\)/);
    // Not dirty on mount, so no save button.
    expect(screen.queryByRole('button', { name: /save timezone/i })).not.toBeInTheDocument();
  });

  it('shows the placeholder when no personal timezone is set', () => {
    mockUseAuth.mockReturnValue({
      user: { ...MOCK_USER, personalTimezone: null },
      logout: vi.fn(),
      refreshUser: mockRefreshUser,
    });
    renderWithProviders(<ProfileEditPage />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent('Platform default (Sydney)');
  });

  it('marks the page dirty and saves the selected timezone', async () => {
    mockMutateTimezone.mockResolvedValue({});
    mockRefreshUser.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ProfileEditPage />);

    await user.click(screen.getByTestId('timezone-picker-trigger'));
    await user.type(screen.getByLabelText('Search timezones'), 'perth');
    await user.click(screen.getByTestId('timezone-option-Australia/Perth'));

    // Dirty tracking feeds the unsaved-changes prompt.
    expect(mockUsePrompt).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: /save timezone/i }));

    expect(mockMutateTimezone).toHaveBeenCalledWith({ timezone: 'Australia/Perth' });
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('shows the mutation error when saving fails', async () => {
    mockMutateTimezone.mockRejectedValue(new Error('Invalid timezone'));
    const user = userEvent.setup();
    renderWithProviders(<ProfileEditPage />);

    await user.click(screen.getByTestId('timezone-picker-trigger'));
    await user.type(screen.getByLabelText('Search timezones'), 'perth');
    await user.click(screen.getByTestId('timezone-option-Australia/Perth'));
    await user.click(screen.getByRole('button', { name: /save timezone/i }));

    expect(await screen.findByText('Invalid timezone')).toBeInTheDocument();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });
});
