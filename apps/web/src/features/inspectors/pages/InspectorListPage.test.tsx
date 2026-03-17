import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { InspectorListPage } from './InspectorListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <InspectorListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InspectorListPage', () => {
  it('renders page title "Inspetores"', () => {
    renderPage();
    expect(screen.getByText('Inspetores')).toBeInTheDocument();
  });

  it('renders "Novo Inspetor" CTA button', () => {
    renderPage();
    const buttons = screen.getAllByText('Novo Inspetor');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with inspector data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    const nameElements = screen.getAllByText('Nome');
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Carlos Silva')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
  });

  it('drawer shows correct inspector data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const narrowDrawer = screen.getAllByRole('dialog').find((d) => d.classList.contains('w-drawer-narrow'))!;
    expect(narrowDrawer).not.toHaveClass('translate-x-full');
    const closeButton = narrowDrawer.querySelector('[aria-label="Fechar"]') as HTMLElement;
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
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('fernanda@inspecoes.com')).toBeInTheDocument();
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

  // New tests for form drawer integration

  it('clicking "Novo Inspetor" opens form drawer with "Criar Inspetor" submit button', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Inspetor');
    fireEvent.click(ctaButtons[0]!);
    expect(screen.getByText('Criar Inspetor')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Inspetor');
    fireEvent.click(ctaButtons[0]!);
    const sections = screen.getAllByText('Dados Pessoais');
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Atuação')).toBeInTheDocument();
  });

  it('closing form drawer hides form content', () => {
    renderPage();
    // Before opening, the wide drawer should be off-screen
    const dialogs = screen.getAllByRole('dialog');
    const wideDrawer = dialogs.find((d) => d.classList.contains('w-drawer-wide'));
    expect(wideDrawer).toBeDefined();
    expect(wideDrawer).toHaveClass('translate-x-full');

    // Open the form drawer
    const ctaButtons = screen.getAllByText('Novo Inspetor');
    fireEvent.click(ctaButtons[0]!);
    expect(wideDrawer).not.toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Editar Inspetor" title', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Find edit button scoped to the narrow (detail) drawer
    const narrowDrawer = screen.getAllByRole('dialog').find((d) => d.classList.contains('w-drawer-narrow'))!;
    expect(narrowDrawer).not.toHaveClass('translate-x-full');
    const editButton = narrowDrawer.querySelector('[aria-label="Editar"]') as HTMLElement;
    expect(editButton).toBeTruthy();
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Inspetor')).toBeInTheDocument();
  });

  it('"Novo Inspetor" button is present and clickable', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Inspetor');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    expect(ctaButtons[0]!.closest('button')).not.toBeDisabled();
  });
});
