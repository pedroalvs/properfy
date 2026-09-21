/**
 * WI-3 (#201) — in edit mode, a failed detail fetch must NOT fall through to
 * an empty, editable form. Saving from blank defaults against an existing
 * contactId would issue a destructive PATCH. The drawer instead shows an
 * error/not-found panel (retry + close) and no reachable Save.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@/lib/api-error';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { tenantId: 'tenant-1' } }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockValidate = vi.fn();
const mockSave = vi.fn();
vi.mock('../hooks/useContactSave', () => ({
  useContactSave: () => ({ save: mockSave, isSaving: false, validate: mockValidate }),
}));

type DetailReturn = {
  contact: unknown;
  isLoading: boolean;
  isError?: boolean;
  error?: ApiError | null;
  refetch?: () => void;
};
let detailReturn: DetailReturn = { contact: null, isLoading: false, error: null, refetch: vi.fn() };
vi.mock('../hooks/useContactDetail', () => ({
  useContactDetail: () => detailReturn,
}));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

import { ContactFormDrawer } from './ContactFormDrawer';

const CONTACT_ID = 'cccccccc-0000-4000-8000-000000000001';

function renderEdit() {
  return render(
    <ContactFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} contactId={CONTACT_ID} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  detailReturn = { contact: null, isLoading: false, error: null, refetch: vi.fn() };
});

describe('ContactFormDrawer — edit-mode detail-load failure', () => {
  it('shows a retryable error panel instead of the editable form when the fetch fails', () => {
    detailReturn = {
      contact: null,
      isLoading: false,
      isError: true,
      error: new ApiError(500, 'Boom', 'INTERNAL_ERROR'),
      refetch: vi.fn(),
    };
    renderEdit();

    // No editable form fields and no enabled Save action.
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    // A recovery affordance is shown.
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('shows a permission panel on a 403 (no editable form)', () => {
    detailReturn = {
      contact: null,
      isLoading: false,
      isError: true,
      error: new ApiError(403, 'No access', 'FORBIDDEN'),
      refetch: vi.fn(),
    };
    renderEdit();

    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  });

  it('shows a not-found panel when the fetch settles with no contact and no error', () => {
    detailReturn = { contact: null, isLoading: false, error: null, refetch: vi.fn() };
    renderEdit();

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
  });

  it('still shows the loading spinner while the detail is loading', () => {
    detailReturn = { contact: null, isLoading: true, error: null, refetch: vi.fn() };
    renderEdit();

    // The editable form and error panel are both absent while loading.
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try Again/i })).not.toBeInTheDocument();
  });

  it('renders the editable form once the contact loads', () => {
    detailReturn = {
      contact: {
        id: CONTACT_ID,
        type: 'PROPERTY_MANAGER',
        displayName: 'Jane',
        company: null,
        primaryEmail: 'jane@example.com',
        primaryPhone: null,
        notes: null,
        additionalChannels: [],
        isActive: true,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    renderEdit();

    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.getByText('Save changes')).toBeInTheDocument();
  });
});
