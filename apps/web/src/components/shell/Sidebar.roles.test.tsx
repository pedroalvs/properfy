import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Only the user widgets are mocked — the real SidebarSubmenu/SidebarItem render so the menu's
// roles, hrefs, aria-haspopup, menuitems and active indicator are observable (L-X01-02).
vi.mock('./SidebarUser', () => ({ SidebarUser: () => <div /> }));
vi.mock('./SidebarUserMenu', () => ({ SidebarUserMenu: () => <div /> }));

import { Sidebar } from './Sidebar';

// Regression blocks render the mobile sidebar, where every nav label is visible text (the
// desktop SidebarItem shows only an icon + hover tooltip, so getByText would not find labels).
function renderMobile(role: string, perms?: string[]) {
  mockUseAuth.mockReturnValue({ user: { role, name: 'Test', clUserPermissions: perms } });
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/dashboard']}>
      <Sidebar mobile />
    </MemoryRouter>,
  );
}

// The dashboard block renders the desktop sidebar to exercise the flyout (aria-haspopup,
// role=menu/menuitem, hrefs, active indicator).
function renderDesktop(role: string, route = '/dashboard', perms?: string[]) {
  mockUseAuth.mockReturnValue({ user: { role, name: 'Test', clUserPermissions: perms } });
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

// The desktop flyout trigger has no onClick (it opens on hover or on Enter/Space); open it with
// a keyboard Enter, which is also the a11y path S1 asserts.
function openFlyout(name: string) {
  const trigger = screen.getByRole('button', { name });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return trigger;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Sidebar role-based visibility — Service Types', () => {
  it('shows Service Types to AM', () => {
    renderMobile('AM');
    expect(screen.getByText('Service Types')).toBeInTheDocument();
  });

  // Regression: OP previously saw Service Types because the submenu item had no roles
  // restriction. The route guard was already AM-only but the nav item was still rendered.
  it('hides Service Types from OP', () => {
    renderMobile('OP');
    expect(screen.queryByText('Service Types')).not.toBeInTheDocument();
  });

  it('still shows Configuration submenu to OP (other items remain)', () => {
    renderMobile('OP');
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('OP still sees Service Regions, Pricing Rules and other config items', () => {
    renderMobile('OP');
    expect(screen.getByText('Service Regions')).toBeInTheDocument();
    expect(screen.getByText('Pricing Rules')).toBeInTheDocument();
    expect(screen.getByText('Notification Templates')).toBeInTheDocument();
  });

  it('does NOT render the retired "Time Slots" nav entry', () => {
    renderMobile('OP');
    expect(screen.queryByText('Time Slots')).not.toBeInTheDocument();
  });
});

describe('Sidebar IA — unified Contacts registry (spec 023)', () => {
  it.each(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('shows the unified "Contacts" entry to %s', (role) => {
    renderMobile(role);
    expect(screen.getByText('Contacts')).toBeInTheDocument();
  });

  it('does NOT render the legacy "Tenant Confirmations" entry (retired in 023)', () => {
    renderMobile('AM');
    expect(screen.queryByText('Tenant Confirmations')).not.toBeInTheDocument();
  });

  it('hides Contacts from INSP', () => {
    renderMobile('INSP');
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument();
  });
});

// Reports became an agency-visible surface: CL_ADMIN unconditionally, CL_USER only when the
// agency enables `view_financials` (same flag as /my-financial).
describe('Sidebar role-based visibility — Reports', () => {
  it.each(['AM', 'OP', 'CL_ADMIN'])('shows Reports to %s', (role) => {
    renderMobile(role);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('hides Reports from a CL_USER without view_financials', () => {
    renderMobile('CL_USER', []);
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });

  it('shows Reports to a CL_USER holding view_financials', () => {
    renderMobile('CL_USER', ['view_financials']);
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('hides Reports from INSP', () => {
    renderMobile('INSP');
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });
});

// The Dashboard sidebar group (X01). Panel screens live in one group; its children mirror each
// route's AuthGuard; a single visible child collapses to a plain "Dashboard" link.
describe('Sidebar — Dashboard group', () => {
  // S1 — AM/OP: a group trigger with aria-haspopup that reveals the three panel menuitems.
  it.each(['AM', 'OP'])('%s: Dashboard is a menu group with Overview, Analytics, Workload', (role) => {
    renderDesktop(role);
    const trigger = screen.getByRole('button', { name: 'Dashboard' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    openFlyout('Dashboard');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Overview' })).toHaveAttribute('href', '/dashboard');
    expect(within(menu).getByRole('menuitem', { name: 'Inspector notices' })).toHaveAttribute('href', '/inspector-notices');
    expect(within(menu).getByRole('menuitem', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(within(menu).getByRole('menuitem', { name: 'Workload' })).toHaveAttribute('href', '/inspector-workload');
  });

  // N — AM/OP: "Inspector notices" sits before Analytics in the canonical X01 order (F02, L-X01-03).
  it.each(['AM', 'OP'])('%s: Inspector notices appears before Analytics in the Dashboard group', (role) => {
    renderDesktop(role);
    openFlyout('Dashboard');
    const labels = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((el) => el.textContent?.trim() ?? '');
    expect(labels.indexOf('Inspector notices')).toBeGreaterThan(labels.indexOf('Overview'));
    expect(labels.indexOf('Inspector notices')).toBeLessThan(labels.indexOf('Analytics'));
  });

  // S2 — CL_ADMIN/CL_USER: Overview + Analytics, no Workload.
  it.each(['CL_ADMIN', 'CL_USER'])('%s: group has Overview and Analytics but not Workload', (role) => {
    renderDesktop(role);
    openFlyout('Dashboard');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Overview' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Analytics' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Workload' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Inspector notices' })).not.toBeInTheDocument();
  });

  // S3 — CL_USER with no flags still sees Analytics (the route requires no flag).
  it('S3: CL_USER with no permissions still sees Analytics', () => {
    renderDesktop('CL_USER', '/dashboard', []);
    openFlyout('Dashboard');
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Analytics' })).toBeInTheDocument();
  });

  // S4 — INSP: a plain Dashboard link, no group, no panel children.
  it('S4: INSP sees a plain Dashboard link to /dashboard, no group', () => {
    renderDesktop('INSP');
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Workload')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspector notices')).not.toBeInTheDocument();
  });

  // S5/S6 — the group shows its active indicator on the panel routes.
  it.each(['/analytics', '/inspector-workload'])('group is active on %s', (route) => {
    renderDesktop('AM', route);
    const container = screen.getByRole('button', { name: 'Dashboard' }).closest('div');
    expect(container?.querySelector('.bg-realty')).not.toBeNull();
  });

  // S7 — Users and Configuration groups are unchanged (regression, desktop).
  it('S7: Users and Configuration remain menu groups for OP', () => {
    renderDesktop('OP');
    expect(screen.getByRole('button', { name: 'Users' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: 'Configuration' })).toHaveAttribute('aria-haspopup', 'menu');
  });

  // S9 — the children appear in the canonical relative order (by label, not index).
  it('S9: children follow the canonical order Overview → Analytics → Workload', () => {
    renderDesktop('AM');
    openFlyout('Dashboard');
    const labels = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((el) => el.textContent?.trim() ?? '');
    expect(labels.indexOf('Overview')).toBeLessThan(labels.indexOf('Analytics'));
    expect(labels.indexOf('Analytics')).toBeLessThan(labels.indexOf('Workload'));
  });
});
