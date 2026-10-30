import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

  // H1 — without backTo, renders outside a router and shows no Back button.
  it('H1: renders without a router and no Back button when backTo is absent', () => {
    render(<PageHeader title="X" />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  // H2 — with backTo, the Back button renders before the heading.
  it('H2: renders the Back button before the heading when backTo is set', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PageHeader title="X" backTo="/p" />
      </MemoryRouter>,
    );
    const back = screen.getByRole('button', { name: 'Back' });
    const heading = screen.getByRole('heading', { name: 'X' });
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // H3 — onBack override is passed through to the button (called with a function).
  it('H3: passes onBack through to the Back button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PageHeader title="X" backTo="/p" onBack={onBack} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledWith(expect.any(Function));
  });

  // H4 — onBack without backTo renders no Back button.
  it('H4: ignores onBack when backTo is absent', () => {
    render(<PageHeader title="X" onBack={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
