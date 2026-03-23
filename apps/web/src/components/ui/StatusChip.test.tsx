import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders with custom label and bg props', () => {
    render(<StatusChip label="Custom Status" bg="#FF0000" />);
    const chip = screen.getByText('Custom Status');
    expect(chip).toBeInTheDocument();
    expect(chip.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('applies text-primary color for custom chips', () => {
    render(<StatusChip label="Test" bg="#00FF00" />);
    const chip = screen.getByText('Test');
    expect(chip.style.color).toBe('var(--color-text-primary)');
  });

  it('allows overriding text color', () => {
    render(<StatusChip label="Test" bg="#00FF00" text="#FFFFFF" />);
    const chip = screen.getByText('Test');
    expect(chip.style.color).toBe('rgb(255, 255, 255)');
  });
});
