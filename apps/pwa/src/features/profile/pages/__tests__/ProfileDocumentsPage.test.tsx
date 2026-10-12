import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileDocumentsPage } from '../ProfileDocumentsPage';

vi.mock('../../hooks/useInspectorMe', () => ({
  useInspectorMe: () => ({
    data: {
      data: {
        // Inspector record's fullName is unpopulated — the card must fall back to
        // the authenticated user's display name (same source as the Account card).
        fullName: null,
        abn: '12 345 678 901',
        dateOfBirth: '1990-01-01',
        insuranceFileKey: null,
        insuranceMetaJson: null,
        insuranceExpiresAt: null,
        policeCheckFileKey: null,
        policeCheckMetaJson: null,
        policeCheckExpiresAt: null,
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'insp-1', name: 'Mike Inspector' } }),
}));

describe('ProfileDocumentsPage', () => {
  it('renders the inspector details card', () => {
    renderWithProviders(<ProfileDocumentsPage />);
    expect(screen.getByTestId('inspector-details-card')).toBeInTheDocument();
    expect(screen.getByText('12 345 678 901')).toBeInTheDocument();
  });

  it('falls back to the authenticated user name when fullName is unpopulated', () => {
    renderWithProviders(<ProfileDocumentsPage />);
    expect(screen.getByText('Mike Inspector')).toBeInTheDocument();
  });
});
