import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard, type StatCardVariant } from './StatCard';

describe('StatCard', () => {
  const defaultProps = {
    icon: 'mdi-file-edit-outline',
    value: 5,
    label: 'Draft',
    variant: 'draft' as StatCardVariant,
  };

  it('renders value and label', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders a decorative, aria-hidden icon', () => {
    render(<StatCard {...defaultProps} />);
    const icon = document.querySelector('.mdi.mdi-file-edit-outline');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('maps each variant to its design-token border/icon classes (W7 #404)', () => {
    const cases: Array<{ variant: StatCardVariant; border: string; icon: string }> = [
      { variant: 'primary', border: 'border-l-primary', icon: 'text-primary' },
      { variant: 'secondary', border: 'border-l-secondary', icon: 'text-secondary' },
      { variant: 'accent', border: 'border-l-accent', icon: 'text-accent' },
      { variant: 'draft', border: 'border-l-status-draft', icon: 'text-status-draft' },
      { variant: 'awaiting', border: 'border-l-status-awaiting', icon: 'text-warning' },
      { variant: 'scheduled', border: 'border-l-status-scheduled', icon: 'text-info' },
      { variant: 'done', border: 'border-l-status-done', icon: 'text-success' },
      { variant: 'rejected', border: 'border-l-status-rejected', icon: 'text-error' },
    ];
    for (const { variant, border, icon } of cases) {
      const { unmount } = render(<StatCard {...defaultProps} variant={variant} />);
      const card = screen.getByTestId('stat-card');
      expect(card.className).toContain(border);
      // No raw hex literal anywhere on the card or icon (token classes only).
      expect(card.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      const iconEl = document.querySelector('.mdi.mdi-file-edit-outline') as HTMLElement;
      expect(iconEl.className).toContain(icon);
      expect(iconEl.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      unmount();
    }
  });

  it('renders zero value correctly', () => {
    render(<StatCard {...defaultProps} value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
