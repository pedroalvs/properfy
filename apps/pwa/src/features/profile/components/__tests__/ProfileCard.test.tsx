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
        status="ACTIVE"
        phone="+5511999999999"
        totpEnabled
        lastLoginAt="2026-03-24T10:00:00Z"
      />,
    );

    expect(screen.getByText('Inspector Jane')).toBeInTheDocument();
    expect(screen.getByText('jane@test.com')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Account Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('+5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Two-Factor')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
    expect(screen.getByText(/managed by your operations team/i)).toBeInTheDocument();
  });

  it('renders <img> avatar when photoUrl is provided', () => {
    renderWithProviders(
      <ProfileCard
        name="Inspector Jane"
        email="jane@test.com"
        role="INSP"
        photoUrl="https://example.com/avatar.jpg"
      />,
    );
    const img = screen.getByRole('img', { name: 'Inspector Jane' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders initials fallback when photoUrl is null', () => {
    renderWithProviders(
      <ProfileCard name="Jane Smith" email="j@test.com" role="INSP" photoUrl={null} />,
    );
    expect(screen.queryByRole('img', { name: 'Jane Smith' })).not.toBeInTheDocument();
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('outlines the initials avatar in its own tint, not a hard-coded green', () => {
    // The inset ring was `rgba(5,150,105,0.10)` — emerald-600 — around a coral
    // `bg-real-estate/10` tint. Same defect the bottom nav had in blue.
    renderWithProviders(
      <ProfileCard name="Jane Smith" email="j@test.com" role="INSP" photoUrl={null} />,
    );
    const avatar = screen.getByText('J');
    expect(avatar.className).toContain('ring-real-estate/10');
    expect(avatar.className).not.toContain('rgba(5,150,105');
  });

  it('renders avatarUploader slot when provided', () => {
    renderWithProviders(
      <ProfileCard
        name="Inspector Jane"
        email="jane@test.com"
        role="INSP"
        avatarUploader={<button>Upload</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('does not render avatarUploader slot when not provided', () => {
    renderWithProviders(
      <ProfileCard name="Jane" email="j@test.com" role="INSP" />,
    );
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('renders "Real Estate" label for CL_ADMIN role', () => {
    renderWithProviders(<ProfileCard name="Jane" email="j@test.com" role="CL_ADMIN" />);
    expect(screen.getByText('Real Estate')).toBeInTheDocument();
  });

  it('renders "Real Estate Operator" label for CL_USER role', () => {
    renderWithProviders(<ProfileCard name="Jane" email="j@test.com" role="CL_USER" />);
    expect(screen.getByText('Real Estate Operator')).toBeInTheDocument();
  });

  describe('stats strip', () => {
    function renderCard(props: Record<string, unknown> = {}) {
      return renderWithProviders(
        <ProfileCard name="Jane" email="jane@test.com" role="INSP" showStats {...props} />,
      );
    }

    it('shows the average rating and the completed count', () => {
      renderCard({ ratingAvg: 4.8, ratingCount: 12, completedCount: 245 });

      expect(screen.getByText('4.80')).toBeInTheDocument();
      expect(screen.getByText('245')).toBeInTheDocument();
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    it('shows an empty state rather than a zero score when unrated', () => {
      renderCard({ ratingAvg: null, ratingCount: 0, completedCount: 3 });

      expect(screen.queryByText('0.00')).not.toBeInTheDocument();
      expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    });

    it('keeps the same height while loading so the card does not jump', () => {
      const { container } = renderCard({ ratingLoading: true });

      const strip = container.querySelector('.min-h-\\[56px\\]');
      expect(strip).not.toBeNull();
      expect(strip!.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('is absent for a non-inspector', () => {
      renderWithProviders(<ProfileCard name="Ana" email="ana@test.com" role="AM" />);

      expect(screen.queryByText('Services')).not.toBeInTheDocument();
    });
  });
});
