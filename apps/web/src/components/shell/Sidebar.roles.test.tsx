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
    expect(screen.getByText('Notification Templates')).toBeInTheDocument();
  });

  it('does NOT render the retired "Time Slots" nav entry', () => {
    renderSidebar('OP');
    expect(screen.queryByText('Time Slots')).not.toBeInTheDocument();
  });
});

describe('Sidebar IA — unified Contacts registry (spec 023)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['AM', 'OP', 'CL_ADMIN', 'CL_USER'])('shows the unified "Contacts" entry to %s', (role) => {
    renderSidebar(role);
    expect(screen.getByText('Contacts')).toBeInTheDocument();
  });

  it('does NOT render the legacy "Tenant Confirmations" entry (retired in 023)', () => {
    renderSidebar('AM');
    expect(screen.queryByText('Tenant Confirmations')).not.toBeInTheDocument();
  });

  it('hides Contacts from INSP', () => {
    renderSidebar('INSP');
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument();
  });
});
