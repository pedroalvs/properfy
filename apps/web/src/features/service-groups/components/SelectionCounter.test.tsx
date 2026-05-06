import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectionCounter } from './SelectionCounter';

describe('SelectionCounter', () => {
  it('shows count with default min/max', () => {
    render(<SelectionCounter count={10} />);
    expect(screen.getByText('10 selected (min 5, max 30)')).toBeInTheDocument();
  });

  it('shows custom min and max', () => {
    render(<SelectionCounter count={3} min={2} max={10} />);
    expect(screen.getByText('3 selected (min 2, max 10)')).toBeInTheDocument();
  });

  it('applies warning style when below min', () => {
    render(<SelectionCounter count={2} min={5} max={25} />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('text-warning');
  });

  it('applies warning style when above max', () => {
    render(<SelectionCounter count={30} min={5} max={25} />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('text-warning');
  });

  it('applies normal style when within range', () => {
    render(<SelectionCounter count={10} min={5} max={25} />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('text-text-secondary');
    expect(el.className).not.toContain('text-warning');
  });

  it('shows warning icon when out of range', () => {
    const { container } = render(<SelectionCounter count={2} />);
    expect(container.querySelector('.mdi-alert-circle-outline')).toBeInTheDocument();
  });

  it('does not show warning icon when in range', () => {
    const { container } = render(<SelectionCounter count={10} />);
    expect(container.querySelector('.mdi-alert-circle-outline')).not.toBeInTheDocument();
  });
});
