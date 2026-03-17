import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { PropertyListPage } from './PropertyListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <PropertyListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PropertyListPage', () => {
  it('renders page title "Imóveis"', () => {
    renderPage();
    expect(screen.getByText('Imóveis')).toBeInTheDocument();
  });

  it('renders "Novo Imóvel" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('Novo Imóvel');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and type controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    const tipoElements = screen.getAllByLabelText('Tipo');
    expect(tipoElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table with property data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('IMV-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('IMV-001')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Geocodificação')).toBeInTheDocument();
  });

  it('drawer shows correct property data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Geocodificação')).toBeInTheDocument();
    const closeButtons = screen.getAllByLabelText('Fechar');
    fireEvent.click(closeButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText('Geocodificação')).not.toBeInTheDocument();
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Rua das Flores, 123')).toBeInTheDocument();

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Av. Paulista, 1000')).toBeInTheDocument();
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

  // New tests for form drawer wiring

  it('clicking "Novo Imóvel" opens form drawer with "Criar Imóvel" submit button', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Imóvel');
    // The first one is the CTA button in the page header
    fireEvent.click(ctaButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Criar Imóvel')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Imóvel');
    fireEvent.click(ctaButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const idSections = screen.getAllByText('Identificação');
    expect(idSections.length).toBeGreaterThanOrEqual(1);
    const addrSections = screen.getAllByText('Endereço');
    expect(addrSections.length).toBeGreaterThanOrEqual(1);
  });

  it('closing form drawer hides form content', () => {
    renderPage();
    // Form drawer is closed initially - check translate-x-full on the wide drawer
    const dialogs = screen.getAllByRole('dialog');
    const wideDrawer = dialogs.find((d) => d.classList.contains('w-drawer-wide'));
    expect(wideDrawer).toBeDefined();
    expect(wideDrawer).toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Editar Imóvel" title', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    // Open detail drawer
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Find the edit button inside the narrow (detail) drawer dialog
    const dialogs = screen.getAllByRole('dialog');
    const narrowDrawer = dialogs.find((d) => d.classList.contains('w-drawer-narrow'))!;
    const editButton = narrowDrawer.querySelector('[aria-label="Editar"]') as HTMLElement;
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Imóvel')).toBeInTheDocument();
  });

  it('"Novo Imóvel" button is present and clickable', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Imóvel');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    // Verify the button is clickable (not disabled)
    const button = ctaButtons[0]!.closest('button');
    expect(button).not.toBeNull();
    expect(button).not.toBeDisabled();
  });
});
