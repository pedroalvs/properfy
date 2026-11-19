import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItemBadge } from './SidebarItemBadge';

describe('SidebarItemBadge', () => {
  it('renders nothing when the count is zero or negative', () => {
    const { container, rerender } = render(<SidebarItemBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SidebarItemBadge count={-3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the amber dot with an accessible count label', () => {
    render(<SidebarItemBadge count={4} />);
    const badge = screen.getByTestId('sidebar-item-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-warning');
    expect(screen.getByText('4 unseen issues')).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<SidebarItemBadge count={2} label="Custom" />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });
});
