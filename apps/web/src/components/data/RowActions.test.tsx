import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActions } from './RowActions';

describe('RowActions', () => {
  it('renders action buttons with aria-label', () => {
    render(
      <RowActions
        actions={[
          { icon: 'mdi-pencil', label: 'Editar', onClick: () => {} },
          { icon: 'mdi-delete', label: 'Excluir', onClick: () => {}, variant: 'delete' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Editar')).toBeInTheDocument();
    expect(screen.getByLabelText('Excluir')).toBeInTheDocument();
  });

  it('calls onClick on action click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <RowActions actions={[{ icon: 'mdi-pencil', label: 'Editar', onClick }]} />,
    );
    await user.click(screen.getByLabelText('Editar'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stops event propagation on click', async () => {
    const user = userEvent.setup();
    const parentClick = vi.fn();
    const actionClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <RowActions actions={[{ icon: 'mdi-pencil', label: 'Editar', onClick: actionClick }]} />
      </div>,
    );
    await user.click(screen.getByLabelText('Editar'));
    expect(actionClick).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('applies delete variant styling', () => {
    render(
      <RowActions
        actions={[{ icon: 'mdi-delete', label: 'Excluir', onClick: () => {}, variant: 'delete' }]}
      />,
    );
    expect(screen.getByLabelText('Excluir').className).toContain('text-error');
  });

  it('disables button when disabled is true', () => {
    render(
      <RowActions
        actions={[{ icon: 'mdi-pencil', label: 'Editar', onClick: () => {}, disabled: true }]}
      />,
    );
    expect(screen.getByLabelText('Editar')).toBeDisabled();
  });
});
