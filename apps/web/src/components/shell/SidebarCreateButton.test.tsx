import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { SidebarCreateButton } from './SidebarCreateButton';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderCta(props: { mobile?: boolean; onNavigate?: () => void } = {}) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={['/dashboard']}
    >
      <SidebarCreateButton {...props} />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe('SidebarCreateButton', () => {
  it.each([false, true])('navigates to the canonical create route when clicked (mobile=%s)', async (mobile) => {
    const user = userEvent.setup();
    renderCta({ mobile });
    await user.click(screen.getByRole('button', { name: /new appointment/i }));
    // /appointments/new is the canonical create entry point; the router redirects it
    // to /appointments?new=1, which opens the create drawer. A wrong target here would
    // silently fail to open the drawer.
    expect(screen.getByTestId('location')).toHaveTextContent('/appointments/new');
  });

  it('calls onNavigate on click (so the mobile drawer closes)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderCta({ mobile: true, onNavigate });
    await user.click(screen.getByRole('button', { name: /new appointment/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('shows the label as visible text in mobile mode', () => {
    renderCta({ mobile: true });
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
  });
});
