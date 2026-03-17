import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BooleanIcon } from './BooleanIcon';

describe('BooleanIcon', () => {
  it('renders check icon for true', () => {
    render(<BooleanIcon value={true} />);
    const icon = screen.getByRole('img', { name: 'Yes' });
    expect(icon.className).toContain('mdi-check-bold');
    expect(icon.className).toContain('text-success');
  });

  it('renders close icon for false', () => {
    render(<BooleanIcon value={false} />);
    const icon = screen.getByRole('img', { name: 'No' });
    expect(icon.className).toContain('mdi-close-thick');
    expect(icon.className).toContain('text-error');
  });
});
