import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { AppointmentListPage } from './AppointmentListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>
      <AuthProvider>{children}</AuthProvider>
    </SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <AppointmentListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppointmentListPage', () => {
  it('renders page title "Vistorias"', () => {
    renderPage();
    expect(screen.getByText('Vistorias')).toBeInTheDocument();
  });

  it('renders "Nova Vistoria" CTA button', () => {
    renderPage();
    // CTA button + form drawer title both contain "Nova Vistoria"
    expect(screen.getAllByText('Nova Vistoria').length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with appointment data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('VST-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('VST-001')).not.toBeInTheDocument();
  });

  it('clicking view icon opens detail drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Detail drawer shows "Contato" section (unique to detail)
    expect(screen.getByText('Contato')).toBeInTheDocument();
  });

  it('drawer shows correct appointment data', () => {
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
    expect(screen.getByText('Contato')).toBeInTheDocument();
    const closeButtons = screen.getAllByLabelText('Fechar');
    fireEvent.click(closeButtons[0]!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText('Contato')).not.toBeInTheDocument();
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('VST-001')).toBeInTheDocument();

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('VST-002')).toBeInTheDocument();
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

  it('clicking "Nova Vistoria" opens form drawer with create title', () => {
    renderPage();
    // Find the CTA button (inside the page header)
    const ctaButton = screen.getAllByText('Nova Vistoria')[0]!.closest('button')!;
    fireEvent.click(ctaButton);
    // Form drawer should show "Criar Vistoria" submit button
    expect(screen.getByText('Criar Vistoria')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const ctaButton = screen.getAllByText('Nova Vistoria')[0]!.closest('button')!;
    fireEvent.click(ctaButton);
    expect(screen.getByText('Contato do Inquilino')).toBeInTheDocument();
    expect(screen.getByText('Acesso e Chave')).toBeInTheDocument();
  });

  it('closing form drawer hides form content', () => {
    renderPage();
    const ctaButton = screen.getAllByText('Nova Vistoria')[0]!.closest('button')!;
    fireEvent.click(ctaButton);
    // Form drawer is open (translate-x-0)
    const dialogs = screen.getAllByRole('dialog');
    const formDialog = dialogs.find((d) => d.classList.contains('w-drawer-wide'))!;
    expect(formDialog).toHaveClass('translate-x-0');
    // Close the form drawer
    const closeButtons = screen.getAllByLabelText('Fechar');
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    // Form drawer should be off-screen
    expect(formDialog).toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Editar Vistoria" title', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Find the edit button in the detail drawer (not table row actions)
    // The detail drawer has a button with aria-label="Editar" inside the drawer header
    const detailDialog = screen.getAllByRole('dialog').find((d) => d.classList.contains('w-drawer-narrow'))!;
    const editButton = detailDialog.querySelector('button[aria-label="Editar"]')!;
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Vistoria')).toBeInTheDocument();
  });

  it('"Nova Vistoria" button is present and clickable', () => {
    renderPage();
    const button = screen.getAllByText('Nova Vistoria')[0]!.closest('button')!;
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
});
