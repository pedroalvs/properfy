import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PastTimeConfirmModal } from '../PastTimeConfirmModal';

describe('PastTimeConfirmModal', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    onCancel.mockClear();
  });

  it('renders the past-time warning', () => {
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    expect(
      screen.getByText('This inspection is past its scheduled time. Complete it anyway?'),
    ).toBeInTheDocument();
  });

  it('calls onConfirm when Complete anyway is clicked', async () => {
    const user = userEvent.setup();
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByTestId('past-time-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByTestId('past-time-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders with correct test ids', () => {
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByTestId('past-time-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('past-time-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('past-time-cancel')).toBeInTheDocument();
  });

  it('is an accessible modal dialog named by its title', () => {
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', {
      name: 'This inspection is past its scheduled time. Complete it anyway?',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus into the dialog on mount and restores it on unmount', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', {
      name: 'This inspection is past its scheduled time. Complete it anyway?',
    });
    expect(dialog.contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<PastTimeConfirmModal onConfirm={onConfirm} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
