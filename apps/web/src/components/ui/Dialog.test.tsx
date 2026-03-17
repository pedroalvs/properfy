import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

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

  it('renders actions when provided', () => {
    render(
      <Dialog open onClose={() => {}} title="Test" actions={<button>Salvar</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });
});
