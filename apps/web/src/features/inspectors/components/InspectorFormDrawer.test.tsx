import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { InspectorFormDrawer } from './InspectorFormDrawer';

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
  inspectorId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    inspectorId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <InspectorFormDrawer
        open={open}
        onClose={onClose}
        inspectorId={inspectorId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste Inspetor' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@inspecoes.com' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InspectorFormDrawer', () => {
  it('renders "Novo Inspetor" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Novo Inspetor')).toBeInTheDocument();
  });

  it('renders "Editar Inspetor" title in edit mode', () => {
    renderDrawer({ inspectorId: 'insp-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Inspetor')).toBeInTheDocument();
  });

  it('renders all form sections in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getByText('Atuação')).toBeInTheDocument();
  });

  it('renders all required field labels', () => {
    renderDrawer();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
  });

  it('renders "Criar Inspetor" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Criar Inspetor')).toBeInTheDocument();
  });

  it('renders "Salvar" submit button in edit mode', () => {
    renderDrawer({ inspectorId: 'insp-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Inspetor'));
    const errorMessages = screen.getAllByText('Campo obrigatório');
    expect(errorMessages).toHaveLength(2);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Inspetor'));
    const errorsBefore = screen.getAllByText('Campo obrigatório').length;
    expect(errorsBefore).toBe(2);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste' } });

    const errorsAfter = screen.getAllByText('Campo obrigatório').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Inspetor'));
    const button = screen.getByText('Criar Inspetor').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Inspetor'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Inspetor criado com sucesso')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from inspector data', () => {
    renderDrawer({ inspectorId: 'insp-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const nameInput = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(nameInput.value).toBe('Carlos Silva');
  });

  it('does not render Status section in create mode', () => {
    renderDrawer();
    const statusLabels = screen.queryAllByText('Status');
    // Status section title should not appear (filter bar Status is not in this component)
    expect(statusLabels).toHaveLength(0);
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
