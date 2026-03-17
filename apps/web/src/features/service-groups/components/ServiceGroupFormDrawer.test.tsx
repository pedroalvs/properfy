import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { ServiceGroupFormDrawer } from './ServiceGroupFormDrawer';

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
      {children}
      <SnackbarDisplay />
    </SnackbarProvider>
  );
}

interface RenderOptions {
  open?: boolean;
  serviceGroupId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    serviceGroupId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <ServiceGroupFormDrawer
        open={open}
        onClose={onClose}
        serviceGroupId={serviceGroupId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste Grupo' } });
  fireEvent.click(screen.getByLabelText('Prioridade'));
  fireEvent.click(screen.getByText('Padrão'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServiceGroupFormDrawer', () => {
  it('renders "Novo Grupo" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Novo Grupo')).toBeInTheDocument();
  });

  it('renders "Editar Grupo" title in edit mode', () => {
    renderDrawer({ serviceGroupId: 'sg-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Grupo')).toBeInTheDocument();
  });

  it('renders all form sections in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Informações')).toBeInTheDocument();
    expect(screen.getByText('Observações')).toBeInTheDocument();
  });

  it('renders all required field labels', () => {
    renderDrawer();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getAllByText('Prioridade').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Criar Grupo" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Criar Grupo')).toBeInTheDocument();
  });

  it('renders "Salvar" submit button in edit mode', () => {
    renderDrawer({ serviceGroupId: 'sg-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Grupo'));
    const errorMessages = screen.getAllByText('Campo obrigatório');
    expect(errorMessages).toHaveLength(2);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Grupo'));
    const errorsBefore = screen.getAllByText('Campo obrigatório').length;
    expect(errorsBefore).toBe(2);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste' } });

    const errorsAfter = screen.getAllByText('Campo obrigatório').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Grupo'));
    const button = screen.getByText('Criar Grupo').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Grupo'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Grupo criado com sucesso')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from service group data', () => {
    renderDrawer({ serviceGroupId: 'sg-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const nameInput = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(nameInput.value).toBe('Zona Sul SP');
  });

  it('renders description textarea in create mode', () => {
    renderDrawer();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
  });

  it('shows confirm dialog when cancelling dirty form', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Dirty' } });
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
