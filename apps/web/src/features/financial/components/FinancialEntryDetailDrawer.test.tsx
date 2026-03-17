import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { FinancialEntryDetailDrawer } from './FinancialEntryDetailDrawer';

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

function renderDrawer(props: { entryId: string | null; open: boolean; onClose?: () => void }) {
  return render(
    <Wrapper>
      <FinancialEntryDetailDrawer
        entryId={props.entryId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
      />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinancialEntryDetailDrawer', () => {
  it('renders drawer with appointment code in header', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('VIST-001');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows financial status chip in header', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Aprovado');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Identificação')).toBeInTheDocument();
    expect(screen.getByText('Valores')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    const loadingElements = screen.getAllByText('Carregando...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ entryId: 'fin-01', open: false });
    act(() => { vi.advanceTimersByTime(200); });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when entryId is null', () => {
    renderDrawer({ entryId: null, open: true });
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Identificação')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ entryId: 'fin-01', open: true, onClose });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});
