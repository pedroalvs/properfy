import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'AM', name: 'Admin' } }),
}));

vi.mock('./SidebarItem', () => ({
  SidebarItem: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('./SidebarSubmenu', () => ({
  SidebarSubmenu: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('./SidebarUser', () => ({
  SidebarUser: () => <div>SidebarUser</div>,
}));
vi.mock('./SidebarUserMenu', () => ({
  SidebarUserMenu: () => <div>SidebarUserMenu</div>,
}));

import { Sidebar, NAV_ITEMS, filterNavItems } from './Sidebar';

const DASHBOARD_GROUP = {
  icon: 'mdi-view-dashboard-outline',
  label: 'Dashboard',
  collapseIfSingle: true,
  submenu: [
    { icon: 'mdi-view-dashboard-outline', label: 'Overview', to: '/dashboard' },
    { icon: 'mdi-chart-line', label: 'Analytics', to: '/analytics', roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] },
    { icon: 'mdi-account-clock-outline', label: 'Workload', to: '/inspector-workload', roles: ['AM', 'OP'] },
  ],
};

function dashboardChildren(role: string, perms?: string[]) {
  const group = filterNavItems(NAV_ITEMS, role, perms).find((item) => item.label === 'Dashboard');
  return group?.submenu?.map((child) => child.to) ?? [];
}

function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe('Sidebar', () => {
  it('renders sidebar element', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('uses bg-transparent on non-map routes (desktop)', () => {
    renderWithRouter(<Sidebar />, ['/appointments']);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('bg-transparent');
    expect(sidebar.className).not.toContain('bg-[#F5F5F5]');
  });

  it('uses bg-[#F5F5F5] on map routes (desktop)', () => {
    renderWithRouter(<Sidebar />, ['/service-regions/map']);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('bg-[#F5F5F5]');
    expect(sidebar.className).not.toContain('bg-transparent');
  });

  it('always uses bg-white on mobile regardless of route', () => {
    renderWithRouter(<Sidebar mobile />, ['/service-regions/map']);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('bg-white');
  });
});

describe('filterNavItems — collapseIfSingle', () => {
  // F1 — collapseIfSingle group with 3 visible children stays a group.
  it('F1: keeps a collapseIfSingle group when more than one child is visible', () => {
    const item = filterNavItems([DASHBOARD_GROUP], 'AM')[0]!;
    expect(item.submenu?.map((c) => c.to)).toEqual([
      '/dashboard',
      '/analytics',
      '/inspector-workload',
    ]);
  });

  // F2 — collapseIfSingle group with a single visible child collapses to a plain item.
  it('F2: collapses to a plain Dashboard item when only one child is visible', () => {
    const item = filterNavItems([DASHBOARD_GROUP], 'INSP')[0]!;
    expect(item).toEqual({
      icon: 'mdi-view-dashboard-outline',
      label: 'Dashboard',
      to: '/dashboard',
    });
    expect(item.submenu).toBeUndefined();
  });

  // F3 — a group WITHOUT the flag and one visible child stays a group (current behaviour).
  it('F3: a group without collapseIfSingle keeps a single visible child as a group', () => {
    const group = {
      icon: 'mdi-cog-outline',
      label: 'Configuration',
      roles: ['AM', 'OP'],
      submenu: [{ icon: 'mdi-x', label: 'Only', to: '/only', roles: ['AM'] }],
    };
    const item = filterNavItems([group], 'AM')[0]!;
    expect(item.submenu?.map((c) => c.to)).toEqual(['/only']);
  });

  // F4 — a group with zero visible children is dropped.
  it('F4: drops a group when no child is visible', () => {
    const group = {
      icon: 'mdi-cog-outline',
      label: 'Configuration',
      submenu: [{ icon: 'mdi-x', label: 'Only', to: '/only', roles: ['AM'] }],
    };
    expect(filterNavItems([group], 'INSP')).toEqual([]);
  });

  // F5 — two-arg call compiles (clUserPermissions optional) and AM sees both panel routes.
  it('F5: filterNavItems(NAV_ITEMS, "AM") exposes /analytics and /inspector-workload', () => {
    const children = dashboardChildren('AM');
    expect(children).toContain('/analytics');
    expect(children).toContain('/inspector-workload');
  });

  // F6 — CL_USER without flags sees /analytics but not /inspector-workload.
  it('F6: CL_USER sees /analytics but not /inspector-workload', () => {
    const children = dashboardChildren('CL_USER');
    expect(children).toContain('/analytics');
    expect(children).not.toContain('/inspector-workload');
  });
});
