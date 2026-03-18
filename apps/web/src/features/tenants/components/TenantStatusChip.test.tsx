import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantStatusChip } from './TenantStatusChip';

describe('TenantStatusChip', () => {
  it('renders Active label for ACTIVE status', () => {
    render(<TenantStatusChip status="ACTIVE" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Inactive label for INACTIVE status', () => {
    render(<TenantStatusChip status="INACTIVE" />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders Pending label for PENDING status', () => {
    render(<TenantStatusChip status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<TenantStatusChip status="ACTIVE" className="extra-class" />);
    const chip = screen.getByText('Active');
    expect(chip).toHaveClass('extra-class');
  });

  it('applies background color from status map', () => {
    render(<TenantStatusChip status="ACTIVE" />);
    const chip = screen.getByText('Active');
    expect(chip).toHaveStyle({ backgroundColor: 'var(--color-user-active)' });
  });
});
