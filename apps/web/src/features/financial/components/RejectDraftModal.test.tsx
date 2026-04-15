import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { RejectDraftModal } from './RejectDraftModal';

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    messages: [],
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/services/api', () => ({
  api: {
    POST: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  },
}));

describe('RejectDraftModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <RejectDraftModal open={false} onClose={onClose} invoiceId="inv-01" onSuccess={onSuccess} />,
      { wrapper: createQueryWrapper() },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when open', () => {
    render(
      <RejectDraftModal open={true} onClose={onClose} invoiceId="inv-01" onSuccess={onSuccess} />,
      { wrapper: createQueryWrapper() },
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Reject Draft Invoice')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Confirm Rejection')).toBeInTheDocument();
  });

  it('shows validation error for empty reason', async () => {
    const user = userEvent.setup();
    render(
      <RejectDraftModal open={true} onClose={onClose} invoiceId="inv-01" onSuccess={onSuccess} />,
      { wrapper: createQueryWrapper() },
    );

    await user.click(screen.getByText('Confirm Rejection'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('shows validation error for short reason', async () => {
    const user = userEvent.setup();
    render(
      <RejectDraftModal open={true} onClose={onClose} invoiceId="inv-01" onSuccess={onSuccess} />,
      { wrapper: createQueryWrapper() },
    );

    await user.type(screen.getByLabelText('Reason'), 'Too short');
    await user.click(screen.getByText('Confirm Rejection'));
    expect(screen.getByText('Minimum 10 characters')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RejectDraftModal open={true} onClose={onClose} invoiceId="inv-01" onSuccess={onSuccess} />,
      { wrapper: createQueryWrapper() },
    );

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
