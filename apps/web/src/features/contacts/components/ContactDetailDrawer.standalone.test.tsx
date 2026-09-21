import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api-error';
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
    const base = { isLoading: false, isError: false, error: null, refetch: vi.fn() };
    if (id === 'standalone') {
      return { ...base, contact: { ...baseContact, tenantId: null, displayName: 'Standalone Pat' } };
    }
    if (id === 'pinned') {
      return { ...base, contact: baseContact };
    }
    if (id === 'errored') {
      return { ...base, contact: null, isError: true, error: new ApiError(500, 'Boom', 'INTERNAL_ERROR') };
    }
    if (id === 'forbidden') {
      return { ...base, contact: null, isError: true, error: new ApiError(403, 'No access', 'FORBIDDEN') };
    }
    return { ...base, contact: null };
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

describe('ContactDetailDrawer — failure fallback (WI-3 #213)', () => {
  it('shows a retryable error fallback (not an empty panel) when the query errors', () => {
    renderWith('errored');

    // A fallback message and a retry action are rendered — the drawer is not blank.
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    // Sections must NOT render since there is no contact.
    expect(screen.queryByText('sections')).not.toBeInTheDocument();
    // The drawer stays dismissible.
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('shows a permission fallback on a 403', () => {
    renderWith('forbidden');

    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.queryByText('sections')).not.toBeInTheDocument();
  });

  it('shows a not-found fallback when the query settles with no contact and no error', () => {
    renderWith('missing');

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText('sections')).not.toBeInTheDocument();
  });
});
