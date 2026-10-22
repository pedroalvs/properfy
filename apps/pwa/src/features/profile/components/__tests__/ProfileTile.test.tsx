import { screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { renderWithProviders } from '@/test-utils';
import { ProfileTile } from '../ProfileTile';

describe('ProfileTile', () => {
  it('renders a link to `to` with the label as its accessible name', () => {
    renderWithProviders(
      <ProfileTile icon={<FileText />} label="Documents" to="/profile/documents" />,
    );
    const link = screen.getByRole('link', { name: 'Documents' });
    expect(link).toHaveAttribute('href', '/profile/documents');
  });

  it('shows the value line when provided', () => {
    renderWithProviders(
      <ProfileTile icon={<FileText />} label="Availability" to="/profile/availability" value="Mon–Fri" />,
    );
    expect(screen.getByText('Mon–Fri')).toBeInTheDocument();
  });

  it('renders a status dot for a non-default tone', () => {
    renderWithProviders(
      <ProfileTile
        icon={<FileText />}
        label="Documents"
        to="/profile/documents"
        tone="warning"
        data-testid="tile-documents"
      />,
    );
    expect(screen.getByTestId('tile-documents-dot')).toBeInTheDocument();
  });

  it('omits the status dot for the default tone', () => {
    renderWithProviders(
      <ProfileTile
        icon={<FileText />}
        label="Earnings"
        to="/earnings"
        data-testid="tile-earnings"
      />,
    );
    expect(screen.queryByTestId('tile-earnings-dot')).not.toBeInTheDocument();
  });

  it('is at least a 112px-tall touch target', () => {
    renderWithProviders(
      <ProfileTile icon={<FileText />} label="My account" to="/profile/account" />,
    );
    expect(screen.getByRole('link', { name: 'My account' }).className).toContain('min-h-[112px]');
  });
});
