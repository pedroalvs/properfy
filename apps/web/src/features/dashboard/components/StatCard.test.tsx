import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  const defaultProps = {
    icon: 'mdi-file-edit-outline',
    value: 5,
    label: 'Rascunho',
    colorClass: 'border-l-[#E1BEE7]',
    iconColorClass: 'text-[#CE93D8]',
  };

  it('renders value and label', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('renders icon element', () => {
    render(<StatCard {...defaultProps} />);
    const icon = document.querySelector('.mdi.mdi-file-edit-outline');
    expect(icon).toBeInTheDocument();
  });

  it('applies border color class to container', () => {
    render(<StatCard {...defaultProps} />);
    const card = screen.getByTestId('stat-card');
    expect(card.className).toContain('border-l-[#E1BEE7]');
  });

  it('has stat-card test id', () => {
    render(<StatCard {...defaultProps} />);
    expect(screen.getByTestId('stat-card')).toBeInTheDocument();
  });

  it('renders zero value correctly', () => {
    render(<StatCard {...defaultProps} value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
