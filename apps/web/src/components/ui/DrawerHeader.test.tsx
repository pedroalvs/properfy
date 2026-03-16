import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DrawerHeader } from './DrawerHeader';

describe('DrawerHeader', () => {
  it('renders title', () => {
    render(<DrawerHeader title="Detalhes da vistoria" onClose={() => {}} />);
    expect(screen.getByText('Detalhes da vistoria')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<DrawerHeader title="Test" onClose={() => {}} />);
    expect(screen.getByLabelText('Fechar')).toBeInTheDocument();
  });

  it('calls onClose on close click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DrawerHeader title="Test" onClose={onClose} />);
    await user.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders actions slot', () => {
    render(
      <DrawerHeader
        title="Test"
        onClose={() => {}}
        actions={<button data-testid="edit-btn">Editar</button>}
      />,
    );
    expect(screen.getByTestId('edit-btn')).toBeInTheDocument();
  });

  it('close button has aria-label "Fechar"', () => {
    render(<DrawerHeader title="Test" onClose={() => {}} />);
    expect(screen.getByLabelText('Fechar')).toBeInTheDocument();
  });
});
