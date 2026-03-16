import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nenhum registro encontrado" />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Vazio" description="Tente ajustar os filtros" />);
    expect(screen.getByText('Tente ajustar os filtros')).toBeInTheDocument();
  });

  it('renders default icon', () => {
    const { container } = render(<EmptyState title="Vazio" />);
    expect(container.querySelector('.mdi-inbox-outline')).toBeTruthy();
  });

  it('renders custom icon', () => {
    const { container } = render(<EmptyState title="Vazio" icon="mdi-folder-open" />);
    expect(container.querySelector('.mdi-folder-open')).toBeTruthy();
  });

  it('renders action button and handles click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState title="Vazio" action={{ label: 'Criar novo', onClick }} />);
    await user.click(screen.getByRole('button', { name: 'Criar novo' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action when not provided', () => {
    render(<EmptyState title="Vazio" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
