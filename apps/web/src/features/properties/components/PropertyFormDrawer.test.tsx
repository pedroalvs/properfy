import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { PropertyFormDrawer } from './PropertyFormDrawer';

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
  propertyId?: string | null;
  onClose?: () => void;
  onSaved?: () => void;
}

function renderDrawer(options: RenderOptions = {}) {
  const {
    open = true,
    propertyId = null,
    onClose = vi.fn(),
    onSaved = vi.fn(),
  } = options;
  return render(
    <Wrapper>
      <PropertyFormDrawer
        open={open}
        onClose={onClose}
        propertyId={propertyId}
        onSaved={onSaved}
      />
    </Wrapper>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Código do Imóvel'), { target: { value: 'IMV-TEST' } });

  fireEvent.click(screen.getByLabelText('Tipo'));
  fireEvent.click(screen.getByText('Residencial'));

  fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua Teste, 100' } });
  fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Centro' } });
  fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001-000' } });
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PropertyFormDrawer', () => {
  it('renders "Novo Imóvel" title in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Novo Imóvel')).toBeInTheDocument();
  });

  it('renders "Editar Imóvel" title in edit mode', () => {
    renderDrawer({ propertyId: 'prop-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Imóvel')).toBeInTheDocument();
  });

  it('renders all form sections', () => {
    renderDrawer();
    expect(screen.getByText('Identificação')).toBeInTheDocument();
    expect(screen.getByText('Endereço')).toBeInTheDocument();
    expect(screen.getAllByText('Observações').length).toBeGreaterThanOrEqual(1);
  });

  it('renders all required field labels', () => {
    renderDrawer();
    expect(screen.getByText('Código do Imóvel')).toBeInTheDocument();
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Rua')).toBeInTheDocument();
    expect(screen.getByText('Bairro')).toBeInTheDocument();
    expect(screen.getByText('CEP')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });

  it('renders "Criar Imóvel" submit button in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Criar Imóvel')).toBeInTheDocument();
  });

  it('renders "Salvar" submit button in edit mode', () => {
    renderDrawer({ propertyId: 'prop-01' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows validation errors on empty create submit', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Imóvel'));
    const errorMessages = screen.getAllByText('Campo obrigatório');
    expect(errorMessages.length).toBeGreaterThanOrEqual(5);
  });

  it('clears validation error when field is corrected', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Criar Imóvel'));
    const errorsBefore = screen.getAllByText('Campo obrigatório').length;
    expect(errorsBefore).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua Teste' } });

    const errorsAfter = screen.getAllByText('Campo obrigatório').length;
    expect(errorsAfter).toBe(errorsBefore - 1);
  });

  it('shows loading state on submit button while saving', async () => {
    renderDrawer();
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Imóvel'));
    const button = screen.getByText('Criar Imóvel').closest('button')!;
    expect(button).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(500); });
  });

  it('calls onSaved after successful create', async () => {
    const onSaved = vi.fn();
    renderDrawer({ onSaved });
    fillRequiredFields();
    fireEvent.click(screen.getByText('Criar Imóvel'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Imóvel criado com sucesso')).toBeInTheDocument();
  });

  it('populates form fields in edit mode from property data', () => {
    renderDrawer({ propertyId: 'prop-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const streetInput = screen.getByLabelText('Rua') as HTMLInputElement;
    expect(streetInput.value).toBe('Rua das Flores, 123');
  });

  it('disables propertyCode input in edit mode', () => {
    renderDrawer({ propertyId: 'prop-01' });
    act(() => { vi.advanceTimersByTime(200); });
    const propertyCodeInput = screen.getByLabelText('Código do Imóvel') as HTMLInputElement;
    expect(propertyCodeInput).toBeDisabled();
  });

  it('shows confirm dialog when cancelling dirty form', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Dirty' } });
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
