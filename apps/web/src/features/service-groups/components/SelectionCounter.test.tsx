import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectionCounter } from './SelectionCounter';

describe('SelectionCounter', () => {
  it('shows the selected count', () => {
    render(<SelectionCounter count={10} />);
    expect(screen.getByText('10 selected')).toBeInTheDocument();
  });

  it('updates with the count', () => {
    render(<SelectionCounter count={1} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('exposes a status role for accessibility', () => {
    render(<SelectionCounter count={3} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
