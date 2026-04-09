import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityListCard } from './EntityListCard';

describe('EntityListCard', () => {
  it('renders children', () => {
    render(<EntityListCard><p>Content</p></EntityListCard>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies white background', () => {
    const { container } = render(<EntityListCard>Test</EntityListCard>);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-card-bg');
  });

  it('merges custom className', () => {
    const { container } = render(<EntityListCard className="mt-4">Test</EntityListCard>);
    const card = container.firstElementChild!;
    expect(card.className).toContain('mt-4');
  });
});
