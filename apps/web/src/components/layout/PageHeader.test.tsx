import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Vistorias" />);
    expect(screen.getByRole('heading', { name: 'Vistorias' })).toBeInTheDocument();
  });

  it('renders primary action button', () => {
    render(
      <PageHeader
        title="Vistorias"
        primaryAction={{ label: 'Nova Vistoria', onClick: () => {} }}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Nova Vistoria' })).toHaveLength(2);
  });

  it('calls primary action onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PageHeader title="Vistorias" primaryAction={{ label: 'Criar', onClick }} />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Criar' })[0]!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders secondary actions', () => {
    render(
      <PageHeader
        title="Vistorias"
        secondaryActions={[
          { label: 'Exportar', onClick: () => {} },
          { label: 'Filtros', onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
  });

  it('renders primary action with icon', () => {
    const { container } = render(
      <PageHeader
        title="Test"
        primaryAction={{ label: 'Criar', icon: 'mdi-plus', onClick: () => {} }}
      />,
    );
    expect(container.querySelector('.mdi-plus')).toBeTruthy();
  });

  it('shows loading state on primary action', () => {
    render(
      <PageHeader
        title="Test"
        primaryAction={{ label: 'Salvando', onClick: () => {}, loading: true }}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Salvando' })[0]).toBeDisabled();
  });
});
