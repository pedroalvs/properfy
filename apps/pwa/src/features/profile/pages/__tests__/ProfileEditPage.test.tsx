import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileEditPage } from '../ProfileEditPage';

const mockUseAuth = vi.fn();
const mockMutateInspectorSelf = vi.fn();
const mockMutateAvailability = vi.fn();
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
