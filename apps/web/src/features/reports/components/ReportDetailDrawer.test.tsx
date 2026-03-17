import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { ReportDetailDrawer } from './ReportDetailDrawer';

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

function renderDrawer(props: { reportId: string | null; open: boolean; onClose?: () => void }) {
  return render(
    <Wrapper>
      <ReportDetailDrawer
        reportId={props.reportId}
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

describe('ReportDetailDrawer', () => {
  it('renders drawer with report file name in header', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('vistorias-agendadas-marco-2026.xlsx');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows report status chip in header', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Pronto');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getAllByText('Relatório').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Arquivo')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    const loadingElements = screen.getAllByText('Carregando...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ reportId: 'rpt-01', open: false });
    act(() => { vi.advanceTimersByTime(200); });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when reportId is null', () => {
    renderDrawer({ reportId: null, open: true });
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Arquivo')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ reportId: 'rpt-01', open: true, onClose });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});
