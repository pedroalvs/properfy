import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('renders with status role and aria-busy', () => {
    render(<LoadingState />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('has hidden loading label', () => {
    render(<LoadingState />);
    expect(screen.getByText('Carregando...')).toHaveClass('sr-only');
  });

  it('renders default 5 skeleton rows', () => {
    const { container } = render(<LoadingState />);
    const rows = container.querySelectorAll('.animate-shimmer');
    expect(rows).toHaveLength(5);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<LoadingState rows={3} />);
    const rows = container.querySelectorAll('.animate-shimmer');
    expect(rows).toHaveLength(3);
  });

  it('applies table variant height by default', () => {
    const { container } = render(<LoadingState />);
    const row = container.querySelector('.animate-shimmer');
    expect(row?.className).toContain('h-10');
  });

  it('applies card variant height', () => {
    const { container } = render(<LoadingState variant="card" />);
    const row = container.querySelector('.animate-shimmer');
    expect(row?.className).toContain('h-24');
  });
});
