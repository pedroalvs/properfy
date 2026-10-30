import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { ProfileAccountPage } from '../ProfileAccountPage';
import { UpdateInspectorSelfError } from '../../hooks/useUpdateInspectorSelf';

const mockUseAuth = vi.fn();
const mockMutateInspectorSelf = vi.fn();
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

vi.mock('../../hooks/useUpdateInspectorSelf', () => {
  class UpdateInspectorSelfError extends Error {
    readonly details?: { path: (string | number)[]; message: string }[];
    constructor(message: string, details?: { path: (string | number)[]; message: string }[]) {
      super(message);
      this.name = 'UpdateInspectorSelfError';
      this.details = details;
    }
  }
  return {
    useUpdateInspectorSelf: () => ({
      mutateAsync: mockMutateInspectorSelf,
      isPending: false,
      isError: false,
    }),
    UpdateInspectorSelfError,
  };
});

vi.mock('../../hooks/useUpdateMyTimezone', () => ({
  useUpdateMyTimezone: () => ({
    mutateAsync: mockMutateTimezone,
    isPending: false,
    isError: false,
  }),
}));

const mockUseInspectorMe = vi.fn(() => ({ data: undefined, isLoading: false, isError: false }));
vi.mock('../../hooks/useInspectorMe', () => ({
  useInspectorMe: () => mockUseInspectorMe(),
}));

vi.mock('@/lib/use-unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: (isDirty: boolean) => mockUsePrompt(isDirty),
}));

// The security sections and avatar uploader have their own dedicated tests; stub
// them here so this suite isolates the account page's phone/timezone/avatar logic.
vi.mock('../../components/ChangePasswordSection', () => ({
  ChangePasswordSection: () => <div data-testid="change-password-section" />,
}));
vi.mock('../../components/TwoFactorSection', () => ({
  TwoFactorSection: () => <div data-testid="two-factor-section" />,
}));
vi.mock('../../components/SessionsSection', () => ({
  SessionsSection: () => <div data-testid="sessions-section" />,
}));
vi.mock('../../components/AvatarUploader', () => ({
  AvatarUploader: () => <div data-testid="avatar-uploader" />,
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

describe('ProfileAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: vi.fn() });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('renders the identity, photo and security sections', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByTestId('avatar-upload-section')).toBeInTheDocument();
    expect(screen.getByTestId('change-password-section')).toBeInTheDocument();
    expect(screen.getByTestId('two-factor-section')).toBeInTheDocument();
    expect(screen.getByTestId('sessions-section')).toBeInTheDocument();
  });

  it('links to App settings in the growth list', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByRole('link', { name: 'App settings' })).toHaveAttribute('href', '/profile/settings');
  });

  it('calls useUnsavedChangesPrompt with aggregated dirty state', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(mockUsePrompt).toHaveBeenCalledWith(false);
  });

  it('keeps a phone gap between the Phone and Timezone cards (not just on tablet)', () => {
    // The 2-up pair collapses to display:block on phone; it must carry its own flex column +
    // gap so the two cards do not touch (0px) below md.
    renderWithProviders(<ProfileAccountPage />);
    const pair = screen.getByTestId('account-phone-timezone');
    expect(pair.className).toContain('flex');
    expect(pair.className).toContain('flex-col');
    expect(pair.className).toContain('gap-3');
    expect(pair.className).toContain('md:grid');
  });

  it('renders null when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, logout: vi.fn(), refreshUser: vi.fn() });
    const { container } = renderWithProviders(<ProfileAccountPage />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ProfileAccountPage — AU phone mask and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: vi.fn() });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('displays the stored E.164 phone in local masked format', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByLabelText(/phone/i)).toHaveValue('0412 345 678');
  });

  it('is not dirty when the stored phone equals its formatted seed', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(mockUsePrompt).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: /save phone/i })).not.toBeInTheDocument();
  });

  it('applies the mask while typing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '0498765432');
    expect(input).toHaveValue('0498 765 432');
  });

  it('blocks save and shows an error for an invalid AU phone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '12345');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid australian phone/i);
    expect(mockMutateInspectorSelf).not.toHaveBeenCalled();
  });

  it('saves a valid local number', async () => {
    mockMutateInspectorSelf.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const input = screen.getByLabelText(/phone/i);
    await user.clear(input);
    await user.type(input, '0498 765 432');
    await user.click(screen.getByRole('button', { name: /save phone/i }));
    expect(mockMutateInspectorSelf).toHaveBeenCalledWith({ phone: '0498 765 432' });
  });

  it('shows the local placeholder', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByPlaceholderText('0412 345 678')).toBeInTheDocument();
  });
});

describe('ProfileAccountPage — Timezone section', () => {
  const mockRefreshUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: mockRefreshUser });
    mockUsePrompt.mockImplementation(() => {});
  });

  it('renders the picker prefilled from the personal timezone', () => {
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent(/Brisbane \(GMT\+\d+\)/);
    expect(screen.queryByRole('button', { name: /save timezone/i })).not.toBeInTheDocument();
  });

  it('shows the placeholder when no personal timezone is set', () => {
    mockUseAuth.mockReturnValue({
      user: { ...MOCK_USER, personalTimezone: null },
      logout: vi.fn(),
      refreshUser: mockRefreshUser,
    });
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByTestId('timezone-picker-trigger')).toHaveTextContent('Platform default (Sydney)');
  });

  it('marks the page dirty and saves the selected timezone', async () => {
    mockMutateTimezone.mockResolvedValue({});
    mockRefreshUser.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);

    await user.click(screen.getByTestId('timezone-picker-trigger'));
    await user.type(screen.getByLabelText('Search timezones'), 'perth');
    await user.click(screen.getByTestId('timezone-option-Australia/Perth'));

    expect(mockUsePrompt).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: /save timezone/i }));

    expect(mockMutateTimezone).toHaveBeenCalledWith({ timezone: 'Australia/Perth' });
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('clears back to the platform default and PATCHes null', async () => {
    mockMutateTimezone.mockResolvedValue({});
    mockRefreshUser.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);

    await user.click(screen.getByTestId('timezone-picker-trigger'));
    await user.click(screen.getByTestId('timezone-option-clear'));

    expect(mockUsePrompt).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: /save timezone/i }));

    expect(mockMutateTimezone).toHaveBeenCalledWith({ timezone: null });
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('shows the mutation error when saving fails', async () => {
    mockMutateTimezone.mockRejectedValue(new Error('Invalid timezone'));
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);

    await user.click(screen.getByTestId('timezone-picker-trigger'));
    await user.type(screen.getByLabelText('Search timezones'), 'perth');
    await user.click(screen.getByTestId('timezone-option-Australia/Perth'));
    await user.click(screen.getByRole('button', { name: /save timezone/i }));

    expect(await screen.findByText('Invalid timezone')).toBeInTheDocument();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });
});

describe('ProfileAccountPage — Base address card', () => {
  const VALID_BASE = {
    street: '1 George St',
    suburb: 'Sydney',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    country: 'AU',
  };

  const meWith = (overrides: Record<string, unknown>) => ({
    data: { data: { id: 'insp-1', ...overrides } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: MOCK_USER, logout: vi.fn(), refreshUser: vi.fn() });
    mockUsePrompt.mockImplementation(() => {});
    mockUseInspectorMe.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('pre-fills the fields from a valid saved base and shows no warning', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByLabelText('Street')).toHaveValue('1 George St');
    expect(screen.getByLabelText('Suburb')).toHaveValue('Sydney');
    expect(screen.getByLabelText('State')).toHaveValue('NSW');
    expect(screen.getByLabelText('Postcode')).toHaveValue('2000');
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
  });

  it('requires Street and does not call PATCH', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    await user.clear(screen.getByLabelText('Street'));
    await user.click(screen.getByRole('button', { name: /save address/i }));
    expect(await screen.findByText('Street is required')).toBeInTheDocument();
    expect(mockMutateInspectorSelf).not.toHaveBeenCalled();
  });

  it('rejects a postcode that is not 4 digits', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const postcode = screen.getByLabelText('Postcode');
    await user.clear(postcode);
    await user.type(postcode, '20');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    expect(await screen.findByText('Postcode must be 4 digits')).toBeInTheDocument();
    expect(mockMutateInspectorSelf).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only Street as empty', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const street = screen.getByLabelText('Street');
    await user.clear(street);
    await user.type(street, '   ');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    expect(await screen.findByText('Street is required')).toBeInTheDocument();
    expect(mockMutateInspectorSelf).not.toHaveBeenCalled();
  });

  it('shows the incomplete notice for a legacy state name and leaves fields empty', () => {
    mockUseInspectorMe.mockReturnValue(
      meWith({ address: { ...VALID_BASE, state: 'New South Wales' }, baseLat: null }),
    );
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByText('Your saved address is incomplete. Please enter it again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Street')).toHaveValue('');
  });

  it('shows the incomplete notice for a non-conforming legacy shape', () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: { foo: 1 }, baseLat: null }));
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByText('Your saved address is incomplete. Please enter it again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Street')).toHaveValue('');
  });

  it('maps a 400 details path to the State field', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    mockMutateInspectorSelf.mockRejectedValue(
      new UpdateInspectorSelfError('Request payload is invalid', [
        { path: ['address', 'state'], message: 'Select a state' },
      ]),
    );
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    // Make the form dirty so Save shows, then submit.
    await user.clear(screen.getByLabelText('Postcode'));
    await user.type(screen.getByLabelText('Postcode'), '3000');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    expect(await screen.findByText('Select a state')).toBeInTheDocument();
  });

  it('submits the expected payload with city derived from suburb and country AU', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    mockMutateInspectorSelf.mockResolvedValue({ baseGeocodeFailed: false });
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    const suburb = screen.getByLabelText('Suburb');
    await user.clear(suburb);
    await user.type(suburb, 'Carlton');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    await waitFor(() =>
      expect(mockMutateInspectorSelf).toHaveBeenCalledWith({
        address: {
          street: '1 George St',
          suburb: 'Carlton',
          city: 'Carlton',
          state: 'NSW',
          postcode: '2000',
          country: 'AU',
        },
      }),
    );
  });

  it('announces success with coordinates in a status region', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: -33.86, baseLng: 151.2 }));
    mockMutateInspectorSelf.mockResolvedValue({ baseGeocodeFailed: false });
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    await user.clear(screen.getByLabelText('Suburb'));
    await user.type(screen.getByLabelText('Suburb'), 'Carlton');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    const status = await screen.findByText('Saved successfully');
    expect(status).toBeInTheDocument();
  });

  it('shows the geocode-failed warning', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: VALID_BASE, baseLat: null }));
    mockMutateInspectorSelf.mockResolvedValue({ baseGeocodeFailed: true });
    const user = userEvent.setup();
    renderWithProviders(<ProfileAccountPage />);
    await user.clear(screen.getByLabelText('Suburb'));
    await user.type(screen.getByLabelText('Suburb'), 'Carlton');
    await user.click(screen.getByRole('button', { name: /save address/i }));
    expect(
      await screen.findByText("Saved, but we couldn't locate this address. Please check it."),
    ).toBeInTheDocument();
  });

  it('focuses the first empty field when opened at #base-address', async () => {
    mockUseInspectorMe.mockReturnValue(meWith({ address: null, baseLat: null }));
    renderWithProviders(<ProfileAccountPage />, { initialEntries: ['/profile/account#base-address'] });
    await waitFor(() => expect(screen.getByLabelText('Street')).toHaveFocus());
  });

  it('still focuses after a cold load where the card starts as a loading skeleton', async () => {
    // Deterministic loading→loaded: a mutable implementation (not mockReturnValueOnce,
    // which an internal re-render would consume) so every read during the loading
    // phase sees `isLoading`, then flips to data on rerender.
    let state: ReturnType<typeof meWith> | { data: undefined; isLoading: boolean; isError: boolean; refetch: () => void } = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    };
    mockUseInspectorMe.mockImplementation(() => state);
    const { rerender } = renderWithProviders(<ProfileAccountPage />, {
      initialEntries: ['/profile/account#base-address'],
    });
    expect(screen.queryByLabelText('Street')).not.toBeInTheDocument(); // skeleton, no form yet
    state = meWith({ address: null, baseLat: null });
    rerender(<ProfileAccountPage />);
    await waitFor(() => expect(screen.getByLabelText('Street')).toHaveFocus());
  });

  it('shows a retry affordance when the inspector query errors', () => {
    mockUseInspectorMe.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderWithProviders(<ProfileAccountPage />);
    expect(screen.getByText("Couldn't load your address.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
