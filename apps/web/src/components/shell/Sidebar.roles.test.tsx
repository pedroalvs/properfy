import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Render submenu label + each item label so role-based filtering is observable.
vi.mock('./SidebarSubmenu', () => ({
  SidebarSubmenu: ({
    label,
    items,
  }: {
    label: string;
    items: { label: string; to: string }[];
  }) => (
    <div>
      <span>{label}</span>
      {items.map((item) => (
        <span key={item.to}>{item.label}</span>
      ))}
    </div>
  ),
}));

vi.mock('./SidebarItem', () => ({
  SidebarItem: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('./SidebarUser', () => ({ SidebarUser: () => <div /> }));
vi.mock('./SidebarUserMenu', () => ({ SidebarUserMenu: () => <div /> }));

import { Sidebar } from './Sidebar';

function renderSidebar(role: string) {
  mockUseAuth.mockReturnValue({ user: { role, name: 'Test' } });
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar role-based visibility — Service Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Service Types to AM', () => {
    renderSidebar('AM');
    expect(screen.getByText('Service Types')).toBeInTheDocument();
  });

  // Regression: OP previously saw Service Types because the submenu item had no
  // roles restriction. The route guard was already AM-only but the nav item was
  // still rendered, creating a shown-but-forbidden UX bug.
  it('hides Service Types from OP', () => {
    renderSidebar('OP');
    expect(screen.queryByText('Service Types')).not.toBeInTheDocument();
  });

  it('still shows Configuration submenu to OP (other items remain)', () => {
    renderSidebar('OP');
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('OP still sees Service Regions, Pricing Rules and other config items', () => {
    renderSidebar('OP');
    expect(screen.getByText('Service Regions')).toBeInTheDocument();
    expect(screen.getByText('Pricing Rules')).toBeInTheDocument();
    expect(screen.getByText('Time Slots')).toBeInTheDocument();
    expect(screen.getByText('Notification Templates')).toBeInTheDocument();
  });
});
