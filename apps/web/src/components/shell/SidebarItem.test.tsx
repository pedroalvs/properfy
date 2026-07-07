import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SidebarItem } from './SidebarItem';

function renderItem(props: Partial<React.ComponentProps<typeof SidebarItem>> = {}) {
  return render(
    <MemoryRouter>
      <SidebarItem icon="mdi-calendar" label="Appointments" to="/appointments" {...props} />
    </MemoryRouter>,
  );
}

describe('SidebarItem', () => {
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
