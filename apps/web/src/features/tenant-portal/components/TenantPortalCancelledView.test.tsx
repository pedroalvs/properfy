import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantPortalCancelledView } from './TenantPortalCancelledView';

describe('TenantPortalCancelledView', () => {
  it('shows the cancelled title', () => {
    render(<TenantPortalCancelledView />);

    expect(
      screen.getByText('This inspection has been cancelled'),
    ).toBeInTheDocument();
  });

  it('shows calendar-remove icon', () => {
    render(<TenantPortalCancelledView />);

    const icon = document.querySelector('.mdi-calendar-remove-outline');
    expect(icon).toBeInTheDocument();
  });

  it('shows agency phone when provided', () => {
    render(<TenantPortalCancelledView agencyPhone="+61 3 9876 5432" />);

    expect(screen.getByText('+61 3 9876 5432')).toBeInTheDocument();
    expect(screen.getByText(/Contact the agency/)).toBeInTheDocument();
  });

  it('does not show phone section when not provided', () => {
    render(<TenantPortalCancelledView />);

    expect(screen.queryByText(/Contact the agency/)).not.toBeInTheDocument();
  });

  it('renders phone as a clickable link', () => {
    render(<TenantPortalCancelledView agencyPhone="+61399865432" />);

    const link = screen.getByRole('link', { name: '+61399865432' });
    expect(link).toHaveAttribute('href', 'tel:+61399865432');
  });
});
