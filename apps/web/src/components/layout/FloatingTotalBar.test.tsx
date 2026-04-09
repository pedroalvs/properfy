import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FloatingTotalBar } from './FloatingTotalBar';

describe('FloatingTotalBar', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<FloatingTotalBar items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders items with formatted amounts', () => {
    render(
      <FloatingTotalBar
        items={[
          { label: 'Total', amount: 1234.5, currency: 'AUD' },
          { label: 'Pending', amount: 500, currency: 'AUD' },
        ]}
      />,
    );

    expect(screen.getByTestId('floating-total-bar')).toBeInTheDocument();
    expect(screen.getByText('Total:')).toBeInTheDocument();
    expect(screen.getByText('Pending:')).toBeInTheDocument();
    // Intl format varies by environment; match the formatted number portion
    expect(screen.getByText(/1,234\.50/)).toBeInTheDocument();
    expect(screen.getByText(/500\.00/)).toBeInTheDocument();
  });

  it('has status role and accessible label', () => {
    render(
      <FloatingTotalBar items={[{ label: 'Total', amount: 100, currency: 'AUD' }]} />,
    );
    expect(screen.getByRole('status', { name: 'Totals' })).toBeInTheDocument();
  });

  it('applies fixed positioning and gradient background', () => {
    render(
      <FloatingTotalBar items={[{ label: 'Total', amount: 100, currency: 'AUD' }]} />,
    );
    const bar = screen.getByTestId('floating-total-bar');
    expect(bar.className).toContain('fixed');
    expect(bar.className).toContain('bottom-0');
    expect(bar.className).toContain('h-[60px]');
    expect(bar.className).toContain('bg-gradient-to-r');
  });

  it('formats different currencies correctly', () => {
    render(
      <FloatingTotalBar items={[{ label: 'Total', amount: 999.99, currency: 'BRL' }]} />,
    );
    // BRL format varies by environment (R$999.99 or BRL 999.99)
    expect(screen.getByText(/999\.99/)).toBeInTheDocument();
  });
});
