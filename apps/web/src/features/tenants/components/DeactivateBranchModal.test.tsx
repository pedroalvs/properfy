import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeactivateBranchModal } from './DeactivateBranchModal';

describe('DeactivateBranchModal', () => {
  it('confirms with the trimmed reason and clears it on the next open (WI-12)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <DeactivateBranchModal
        open
        branchName="Main Branch"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const textarea = screen.getByLabelText('Deactivation reason');
    await user.type(textarea, '  Closing this branch  ');

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalledWith('Closing this branch');

    // Parent flips `open` off after confirm WITHOUT calling handleClose, then
    // reopens (e.g. for another branch). The reset-on-open effect must clear
    // the stale reason.
    rerender(
      <DeactivateBranchModal
        open={false}
        branchName="Main Branch"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    rerender(
      <DeactivateBranchModal
        open
        branchName="Other Branch"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const reopened = screen.getByLabelText('Deactivation reason') as HTMLTextAreaElement;
    expect(reopened.value).toBe('');
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});
