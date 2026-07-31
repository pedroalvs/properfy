import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SidebarItem } from './SidebarItem';

function renderItem(
  props: Partial<React.ComponentProps<typeof SidebarItem>> = {},
  { route = '/' }: { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SidebarItem icon="mdi-calendar" label="Appointments" to="/appointments" {...props} />
    </MemoryRouter>,
  );
}

/** The 4px bar down the left edge — the whole desktop active affordance. */
function indicator(container: HTMLElement) {
  return container.querySelector('a > span');
}

describe('SidebarItem', () => {
  // Nothing covered the desktop active state: the only two tests that did were deleted in
  // 9566ac15, and they asserted on `sidebar-active` — a marker class that was never
  // defined anywhere, so they would have passed even with the indicator ripped out. These
  // assert the affordance users actually see.
  it('marks the active desktop item with the realty indicator bar', () => {
    const { container } = renderItem({}, { route: '/appointments' });
    const bar = indicator(container);
    expect(bar).toHaveClass('bg-realty');
    // 4px bar overhanging the item by 4px each side, per the legacy sidebar CSS.
    expect(bar).toHaveClass('w-1');
  });

  it('leaves the indicator transparent when the item is not active', () => {
    const { container } = renderItem({}, { route: '/properties' });
    expect(indicator(container)).toHaveClass('bg-transparent');
  });

  it('shows a tooltip with the destination label on hover (desktop)', () => {
    renderItem();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Appointments' }));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Appointments');
    expect(tooltip.parentElement).toBe(document.body);

    fireEvent.mouseLeave(screen.getByRole('link', { name: 'Appointments' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on keyboard focus and hides it on blur (desktop)', () => {
    renderItem();
    fireEvent.focus(screen.getByRole('link', { name: 'Appointments' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Appointments');

    fireEvent.blur(screen.getByRole('link', { name: 'Appointments' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not render a tooltip on mobile (label is already visible)', () => {
    renderItem({ mobile: true });
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Appointments' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });
});
