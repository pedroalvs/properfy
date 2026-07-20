import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
vi.mock('../hooks/useContactDetail', () => ({
  useContactDetail: () => ({ contact: null, isLoading: false }),
}));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

import { ContactFormDrawer } from './ContactFormDrawer';

function renderDrawer() {
  return render(
    <ContactFormDrawer open onClose={vi.fn()} onSaved={vi.fn()} />,
  );
}

describe('ContactFormDrawer — per-row channel errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
  });

  it('shows a validation error under the offending channel row', () => {
    mockValidate.mockReturnValue({ additionalChannelErrors: { 1: 'Must be a valid Australian phone number' } });
    renderDrawer();
    fireEvent.click(screen.getByLabelText('Add additional channel'));
    fireEvent.click(screen.getByLabelText('Add additional channel'));
    fireEvent.click(screen.getByText('Create contact'));
    expect(screen.getByText('Must be a valid Australian phone number')).toBeInTheDocument();
  });

  it('reindexes row errors when an earlier channel is removed', () => {
    mockValidate.mockReturnValue({ additionalChannelErrors: { 1: 'Must be a valid Australian phone number' } });
    renderDrawer();
    fireEvent.click(screen.getByLabelText('Add additional channel'));
    fireEvent.click(screen.getByLabelText('Add additional channel'));
    fireEvent.change(screen.getByLabelText('Channel 2 value'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Create contact'));
    expect(screen.getByText('Must be a valid Australian phone number')).toBeInTheDocument();

    // Removing row 1 shifts the error from index 1 to index 0 (still on the
    // row that owned it), instead of orphaning or misplacing it.
    fireEvent.click(screen.getByLabelText('Remove channel 1'));
    expect(screen.getByText('Must be a valid Australian phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Channel 1 value')).toHaveValue('bad');
  });

  it('renders backend VALIDATION_ERROR details inline on the matching field', async () => {
    mockValidate.mockReturnValue({});
    mockSave.mockResolvedValue({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      fieldErrors: { primaryEmail: 'Invalid email address' },
    });
    renderDrawer();
    fireEvent.click(screen.getByText('Create contact'));
    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    // All details matched a form field — no summary snackbar.
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('clears a row error when that channel row is removed', () => {
    mockValidate.mockReturnValue({ additionalChannelErrors: { 0: 'Must be a valid email address' } });
    renderDrawer();
    fireEvent.click(screen.getByLabelText('Add additional channel'));
    fireEvent.click(screen.getByText('Create contact'));
    expect(screen.getByText('Must be a valid email address')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove channel 1'));
    expect(screen.queryByText('Must be a valid email address')).not.toBeInTheDocument();
  });
});
