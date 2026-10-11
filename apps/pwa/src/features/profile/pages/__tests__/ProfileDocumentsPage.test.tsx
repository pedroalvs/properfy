import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileDocumentsPage } from '../ProfileDocumentsPage';

vi.mock('../../hooks/useInspectorMe', () => ({
  useInspectorMe: () => ({
    data: {
      data: {
        fullName: 'Diego Santos',
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

describe('ProfileDocumentsPage', () => {
  it('renders the inspector details card', () => {
    renderWithProviders(<ProfileDocumentsPage />);
    expect(screen.getByTestId('inspector-details-card')).toBeInTheDocument();
    expect(screen.getByText('12 345 678 901')).toBeInTheDocument();
  });
});
