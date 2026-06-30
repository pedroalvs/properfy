import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactDetailDrawer } from './ContactDetailDrawer';
import type { Contact } from '../types';

const baseContact: Contact = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  type: 'PROPERTY_MANAGER',
  displayName: 'Pat Manager',
  company: null,
  primaryEmail: 'pat@example.com',
  primaryPhone: null,
  additionalChannels: [],
  notes: null,
  isActive: true,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

vi.mock('../hooks/useContactDetail', () => ({
  useContactDetail: (id: string | null) => {
    if (id === 'standalone') {
      return { contact: { ...baseContact, tenantId: null, displayName: 'Standalone Pat' }, isLoading: false };
    }
    if (id === 'pinned') {
      return { contact: baseContact, isLoading: false };
    }
    return { contact: null, isLoading: false };
  },
}));

vi.mock('@/components/ui/DrawerPanel', () => ({
  DrawerPanel: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
}));

vi.mock('@/components/ui/DrawerHeader', () => ({
  DrawerHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <div>{actions}</div>
    </div>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...rest }: { children: React.ReactNode; [k: string]: unknown }) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/feedback/LoadingState', () => ({
  LoadingState: () => <div>Loading…</div>,
}));

vi.mock('./ContactTypeChip', () => ({ ContactTypeChip: () => <span>type-chip</span> }));
vi.mock('./ContactStatusBadge', () => ({ ContactStatusBadge: () => <span>status-badge</span> }));
vi.mock('./ContactDetailSections', () => ({ ContactDetailSections: () => <div>sections</div> }));

function renderWith(id: string) {
  return render(
    <MemoryRouter>
      <ContactDetailDrawer
        contactId={id}
        open
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('ContactDetailDrawer — Standalone label (024 §FR-301)', () => {
  it('renders the "Standalone" badge when contact.tenantId is null', () => {
    renderWith('standalone');

    // Heading shows the contact's display name regardless of tenant linkage.
    expect(screen.getByRole('heading', { name: 'Standalone Pat' })).toBeInTheDocument();
    // The Standalone affordance appears alongside the type/status chips.
    expect(screen.getByLabelText(/Standalone contact \(no agency\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Standalone$/)).toBeInTheDocument();
  });

  it('does NOT render the Standalone badge when contact.tenantId is a real tenant', () => {
    renderWith('pinned');

    expect(screen.getByRole('heading', { name: 'Pat Manager' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Standalone contact \(no agency\)/i)).not.toBeInTheDocument();
  });
});
