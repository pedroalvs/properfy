import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncConfirmModal } from '../SyncConfirmModal';

describe('SyncConfirmModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('renders the sync question and guidance', () => {
    render(<SyncConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('Is this inspection synced to the Inspection App?')).toBeInTheDocument();
    expect(screen.getByText(/sync it in the Inspection App/i)).toBeInTheDocument();
  });

  it('calls onConfirm when Yes is clicked', async () => {
    const user = userEvent.setup();
    render(<SyncConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByTestId('sync-confirm-yes'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when No is clicked', async () => {
    const user = userEvent.setup();
    render(<SyncConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByTestId('sync-confirm-no'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders with correct test ids', () => {
    render(<SyncConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByTestId('sync-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('sync-confirm-yes')).toBeInTheDocument();
    expect(screen.getByTestId('sync-confirm-no')).toBeInTheDocument();
  });
});
