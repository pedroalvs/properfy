import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoidAwardDialog } from './VoidAwardDialog';

function renderDialog(extra: Partial<Parameters<typeof VoidAwardDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <VoidAwardDialog open inspectorName="Jane Doe" onClose={onClose} onConfirm={onConfirm} {...extra} />,
  );
  return { onConfirm, onClose };
}

describe('VoidAwardDialog', () => {
  it('renders the two fields with their help text and no recovery note', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Void reward' })).toBeInTheDocument();
    expect(screen.getByLabelText('Internal reason')).toBeInTheDocument();
    expect(screen.getByText('Only the Properfy team sees this.')).toBeInTheDocument();
    expect(screen.getByLabelText('Note to the inspector (optional)')).toBeInTheDocument();
    expect(screen.getByText("Shown in the inspector's app.")).toBeInTheDocument();
    expect(screen.queryByText(/Recovery note/i)).not.toBeInTheDocument();
  });

  it('keeps Void disabled until the reason reaches 5 characters', async () => {
    renderDialog();
    const voidBtn = screen.getByRole('button', { name: 'Void reward' });
    expect(voidBtn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Internal reason'), 'abcde');
    expect(voidBtn).toBeEnabled();
  });

  it('confirms with the reason and optional inspector note', async () => {
    const { onConfirm } = renderDialog();
    await userEvent.type(screen.getByLabelText('Internal reason'), 'Agency rejected the job');
    await userEvent.type(screen.getByLabelText('Note to the inspector (optional)'), 'Sorry about that');
    await userEvent.click(screen.getByRole('button', { name: 'Void reward' }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Agency rejected the job', inspectorNote: 'Sorry about that' });
  });

  it('omits the inspector note when left blank', async () => {
    const { onConfirm } = renderDialog();
    await userEvent.type(screen.getByLabelText('Internal reason'), 'Agency rejected the job');
    await userEvent.click(screen.getByRole('button', { name: 'Void reward' }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: 'Agency rejected the job', inspectorNote: undefined });
  });
});
