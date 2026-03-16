import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { InspectorDetailDrawer } from './InspectorDetailDrawer';

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

function renderDrawer(props: { inspectorId: string | null; open: boolean; onClose?: () => void }) {
  return render(
    <Wrapper>
      <InspectorDetailDrawer
        inspectorId={props.inspectorId}
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

describe('InspectorDetailDrawer', () => {
  it('renders drawer with inspector name in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Carlos Silva');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inspector status chip in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows detail sections', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    expect(screen.getByText('Atuação')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const loadingElements = screen.getAllByText('Carregando...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ inspectorId: 'insp-01', open: false });
    act(() => { vi.advanceTimersByTime(200); });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when inspectorId is null', () => {
    renderDrawer({ inspectorId: null, open: true });
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Dados Pessoais')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ inspectorId: 'insp-01', open: true, onClose });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});
