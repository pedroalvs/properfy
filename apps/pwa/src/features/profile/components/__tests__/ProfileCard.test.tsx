import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { ProfileCard } from '../ProfileCard';

describe('ProfileCard', () => {
  it('renders profile details and security fields', () => {
    renderWithProviders(
      <ProfileCard
        name="Inspector Jane"
        email="jane@test.com"
        role="INSP"
        phone="+5511999999999"
        totpEnabled
        lastLoginAt="2026-03-24T10:00:00Z"
      />,
    );

    expect(screen.getByText('Inspector Jane')).toBeInTheDocument();
    expect(screen.getByText('jane@test.com')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('+5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Two-Factor')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });
});
