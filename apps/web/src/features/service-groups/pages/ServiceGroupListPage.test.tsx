import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ServiceGroupListPage } from './ServiceGroupListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <ServiceGroupListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServiceGroupListPage', () => {
  it('renders page title "Grupos de Serviço"', () => {
    renderPage();
    expect(screen.getByText('Grupos de Serviço')).toBeInTheDocument();
  });

  it('renders "Novo Grupo" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('Novo Grupo');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with service group data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('ABC Paulista')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    const matches = screen.getAllByText('Nome');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('ABC Paulista')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Informações');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('drawer shows correct service group data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('São Paulo - ABC');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Informações');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const narrowDrawer = document.querySelector('.w-drawer-narrow') as HTMLElement;
    const closeButton = within(narrowDrawer).getByLabelText('Fechar');
    fireEvent.click(closeButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(narrowDrawer).toHaveClass('translate-x-full');
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('São Paulo - ABC');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches2 = screen.getAllByText('Rio de Janeiro - Barra');
    expect(matches2.length).toBeGreaterThanOrEqual(1);
  });

  it('drawer renders within page', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking "Novo Grupo" opens form drawer with "Criar Grupo" submit button', () => {
    renderPage();
    const novoGrupoButtons = screen.getAllByText('Novo Grupo');
    // Click the CTA button (first occurrence in the page header)
    fireEvent.click(novoGrupoButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Criar Grupo')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const novoGrupoButtons = screen.getAllByText('Novo Grupo');
    fireEvent.click(novoGrupoButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    const matches = screen.getAllByText('Informações');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const obsMatches = screen.getAllByText('Observações');
    expect(obsMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing form drawer hides form content', () => {
    renderPage();
    const novoGrupoButtons = screen.getAllByText('Novo Grupo');
    fireEvent.click(novoGrupoButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    const wideDrawer = document.querySelector('.w-drawer-wide') as HTMLElement;
    expect(wideDrawer).not.toHaveClass('translate-x-full');
    const closeButton = within(wideDrawer).getByLabelText('Fechar');
    fireEvent.click(closeButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(wideDrawer).toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Editar Grupo" title', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const narrowDrawer = document.querySelector('.w-drawer-narrow') as HTMLElement;
    const editButton = within(narrowDrawer).getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Grupo')).toBeInTheDocument();
  });

  it('"Novo Grupo" button is present and clickable', () => {
    renderPage();
    const novoGrupoButtons = screen.getAllByText('Novo Grupo');
    expect(novoGrupoButtons.length).toBeGreaterThanOrEqual(1);
    expect(() => fireEvent.click(novoGrupoButtons[0]!)).not.toThrow();
  });
});
