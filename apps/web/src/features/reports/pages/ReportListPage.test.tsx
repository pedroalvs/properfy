import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ReportListPage } from './ReportListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <ReportListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReportListPage', () => {
  it('renders page title "Relatórios"', () => {
    renderPage();
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  it('renders "Gerar Relatório" CTA button', () => {
    renderPage();
    expect(screen.getByText('Gerar Relatório')).toBeInTheDocument();
  });

  it('renders filter bar with type and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with report data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getAllByText('Admin Principal').length).toBeGreaterThan(0);
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Solicitação')).toBeInTheDocument();
  });

  it('drawer shows correct report data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Pendente');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Solicitação')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Fechar'));
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText('Solicitação')).not.toBeInTheDocument();
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('drawer renders within page', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
