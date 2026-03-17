import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { AppointmentFormDrawer } from './AppointmentFormDrawer';

function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>
      <AuthProvider>
        {children}
        <SnackbarDisplay />
      </AuthProvider>
    </SnackbarProvider>
  );
}

interface RenderOptions {
  open?: boolean;
  appointmentId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    appointmentId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <AppointmentFormDrawer
        open={open}
        onClose={onClose}
        appointmentId={appointmentId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  // Fill branch
  fireEvent.click(screen.getByLabelText('Filial'));
  fireEvent.click(screen.getByText('Filial Centro'));

  // Fill property
  fireEvent.click(screen.getByLabelText('Imóvel'));
  fireEvent.click(screen.getByText('IMV-001 — Rua das Flores, 123'));

  // Fill service type
  fireEvent.click(screen.getByLabelText('Tipo de Serviço'));
  fireEvent.click(screen.getByText('Vistoria de Entrada'));

  // Fill date
  fireEvent.change(screen.getByLabelText('Data Agendada'), { target: { value: '2026-04-01' } });

  // Fill time slot
  fireEvent.click(screen.getByLabelText('Faixa de Horário'));
  fireEvent.click(screen.getByText('09:00 - 12:00'));

  // Fill contact name
  fireEvent.change(screen.getByLabelText('Nome do Inquilino'), { target: { value: 'João Silva' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppointmentFormDrawer', () => {
  it('renders "Nova Vistoria" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Nova Vistoria')).toBeInTheDocument();
  });

  it('renders "Editar Vistoria" title in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Vistoria')).toBeInTheDocument();
  });

  it('renders all form sections', () => {
    renderDrawer();
    expect(screen.getByText('Dados da Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Contato do Inquilino')).toBeInTheDocument();
    expect(screen.getByText('Acesso e Chave')).toBeInTheDocument();
    expect(screen.getAllByText('Observações').length).toBeGreaterThanOrEqual(1);
  });

  it('renders all required field labels', () => {
    renderDrawer();
    expect(screen.getByText('Filial')).toBeInTheDocument();
    expect(screen.getByText('Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Tipo de Serviço')).toBeInTheDocument();
    expect(screen.getByText('Data Agendada')).toBeInTheDocument();
    expect(screen.getByText('Faixa de Horário')).toBeInTheDocument();
    expect(screen.getByText('Nome do Inquilino')).toBeInTheDocument();
  });

  it('renders "Criar Vistoria" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Criar Vistoria')).toBeInTheDocument();
  });

  it('renders "Salvar" submit button in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Vistoria'));
    const errorMessages = screen.getAllByText('Campo obrigatório');
    expect(errorMessages.length).toBeGreaterThanOrEqual(5);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Vistoria'));
    const errorsBefore = screen.getAllByText('Campo obrigatório').length;
    expect(errorsBefore).toBeGreaterThan(0);

    // Fill contact name to clear its error on change
    fireEvent.change(screen.getByLabelText('Nome do Inquilino'), { target: { value: 'Maria' } });

    // Error count should be reduced by one (contactName error cleared)
    const errorsAfter = screen.getAllByText('Campo obrigatório').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Vistoria'));
    // During save, button should be in loading state (disabled)
    const button = screen.getByText('Criar Vistoria').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Vistoria'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Vistoria criada com sucesso')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from appointment data', () => {
    renderDrawer({ appointmentId: 'apt-02' });
    act(() => { vi.advanceTimersByTime(200); });
    // apt-02 has contactName: 'Maria Santos'
    const nameInput = screen.getByLabelText('Nome do Inquilino') as HTMLInputElement;
    expect(nameInput.value).toBe('Maria Santos');
  });

  it('disables branch/property/service type selects in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const branchButton = screen.getByLabelText('Filial');
    const propertyButton = screen.getByLabelText('Imóvel');
    const serviceButton = screen.getByLabelText('Tipo de Serviço');
    expect(branchButton).toBeDisabled();
    expect(propertyButton).toBeDisabled();
    expect(serviceButton).toBeDisabled();
  });

  it('shows confirm dialog when cancelling dirty form', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    // Make form dirty by changing a field
    fireEvent.change(screen.getByLabelText('Nome do Inquilino'), { target: { value: 'Dirty' } });
    // Click Cancel
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without confirm dialog when form is clean', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});
