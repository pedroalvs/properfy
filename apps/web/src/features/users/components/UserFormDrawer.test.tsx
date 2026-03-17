import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { UserFormDrawer } from './UserFormDrawer';

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
  userId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    userId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <UserFormDrawer
        open={open}
        onClose={onClose}
        userId={userId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste Usuário' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@properfy.com' } });
  fireEvent.click(screen.getByLabelText('Perfil'));
  fireEvent.click(screen.getByText('Admin Master'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UserFormDrawer', () => {
  it('renders "Novo Usuário" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Novo Usuário')).toBeInTheDocument();
  });

  it('renders "Editar Usuário" title in edit mode', () => {
    renderDrawer({ userId: 'usr-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Usuário')).toBeInTheDocument();
  });

  it('renders all form sections in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getByText('Vínculo')).toBeInTheDocument();
  });

  it('renders all required field labels', () => {
    renderDrawer();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.getAllByText('Perfil').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Criar Usuário" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Criar Usuário')).toBeInTheDocument();
  });

  it('renders "Salvar" submit button in edit mode', () => {
    renderDrawer({ userId: 'usr-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Usuário'));
    const errorMessages = screen.getAllByText('Campo obrigatório');
    expect(errorMessages).toHaveLength(3);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Usuário'));
    const errorsBefore = screen.getAllByText('Campo obrigatório').length;
    expect(errorsBefore).toBe(3);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teste' } });

    const errorsAfter = screen.getAllByText('Campo obrigatório').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Usuário'));
    const button = screen.getByText('Criar Usuário').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Usuário'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Usuário criado com sucesso')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from user data', () => {
    renderDrawer({ userId: 'usr-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const nameInput = screen.getByLabelText('Nome') as HTMLInputElement;
    expect(nameInput.value).toBe('Admin Principal');
  });

  it('does not render Status section in create mode', () => {
    renderDrawer();
    const statusLabels = screen.queryAllByText('Status');
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
