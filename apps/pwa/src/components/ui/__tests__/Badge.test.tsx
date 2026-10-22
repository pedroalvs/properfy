import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge tone="green">Confirmed</Badge>);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('applies the tone token classes (not inline colours)', () => {
    render(<Badge tone="amber">Awaiting</Badge>);
    const el = screen.getByText('Awaiting');
    expect(el.className).toContain('bg-pill-amber');
    expect(el.className).toContain('text-pill-amber-foreground');
    expect(el).not.toHaveAttribute('style');
  });

  it('defaults to the gray tone', () => {
    render(<Badge>Neutral</Badge>);
    expect(screen.getByText('Neutral').className).toContain('bg-pill-gray');
  });

  it('uses the 5px artboard gap (.pf-chip)', () => {
    render(<Badge tone="green">Confirmed</Badge>);
    expect(screen.getByText('Confirmed').className).toContain('gap-[5px]');
  });
});
