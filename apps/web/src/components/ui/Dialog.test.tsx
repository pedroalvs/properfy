import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { DrawerPanel } from './DrawerPanel';

/**
 * Mirrors the real-world consumer shape (e.g. CancelGroupModal): local state driven by a
 * field inside the dialog, with an inline arrow as `onClose` — so `onClose` has a new
 * identity on every keystroke.
 */
function ReasonDialogHarness() {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Cancel Service Group">
      <textarea
        aria-label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Dialog>
  );
}

describe('Dialog', () => {
  it('renders title and content when open', () => {
    render(
      <Dialog open onClose={() => {}} title="Criar categoria">
        <p>Conteúdo</p>
      </Dialog>,
    );
    expect(screen.getByText('Criar categoria')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Hidden">
        <p>Invisible</p>
      </Dialog>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls the latest onClose on Escape after onClose identity changes', async () => {
    const user = userEvent.setup();
    const staleOnClose = vi.fn();
    const freshOnClose = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={staleOnClose} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    rerender(
      <Dialog open onClose={freshOnClose} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(staleOnClose).not.toHaveBeenCalled();
    expect(freshOnClose).toHaveBeenCalledOnce();
  });

  it('focuses the dialog container when it opens', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    rerender(
      <Dialog open onClose={() => {}} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog').querySelector('[tabindex="-1"]')).toHaveFocus();
  });

  it('does not steal focus from a child when onClose identity changes', () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Test">
        <input aria-label="Field" />
      </Dialog>,
    );
    const input = screen.getByLabelText('Field');
    input.focus();
    expect(input).toHaveFocus();

    rerender(
      <Dialog open onClose={() => {}} title="Test">
        <input aria-label="Field" />
      </Dialog>,
    );
    expect(input).toHaveFocus();
  });

  it('keeps focus in a field while typing a multi-character value', async () => {
    const user = userEvent.setup();
    render(<ReasonDialogHarness />);

    const textarea = screen.getByLabelText('Reason');
    await user.click(textarea);
    await user.type(textarea, 'no longer needed');

    expect(textarea).toHaveValue('no longer needed');
    expect(textarea).toHaveFocus();
  });

  it('renders actions when provided', () => {
    render(
      <Dialog open onClose={() => {}} title="Test" actions={<button>Salvar</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('locks the page scroll while open and restores it on close', () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog open={false} onClose={() => {}} title="Test">
        <p>Body</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('consumes Escape so a Dialog nested in a DrawerPanel does not close the drawer', async () => {
    const user = userEvent.setup();
    const onDrawerClose = vi.fn();
    const onDialogClose = vi.fn();

    render(
      <DrawerPanel open onClose={onDrawerClose} size="narrow">
        <p>Drawer body</p>
        <Dialog open onClose={onDialogClose} title="Nested">
          <p>Dialog body</p>
        </Dialog>
      </DrawerPanel>,
    );

    await user.keyboard('{Escape}');

    expect(onDialogClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();
  });
});
