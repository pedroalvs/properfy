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

import { Sidebar } from './Sidebar';

function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
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
