import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { TenantContactListPage } from './TenantContactListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <TenantContactListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TenantContactListPage', () => {
  it('renders page title "Inquilinos"', () => {
    renderPage();
    expect(screen.getByText('Inquilinos')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status Confirmação')).toBeInTheDocument();
  });

  it('renders data table with tenant data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Contato')).toBeInTheDocument();
  });

  it('drawer shows correct contact data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('ana.silva@email.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Contato')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Fechar'));
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText('Contato')).not.toBeInTheDocument();
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('ana.silva@email.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches2 = screen.getAllByText('bruno@email.com');
    expect(matches2.length).toBeGreaterThanOrEqual(1);
  });

  it('drawer renders within page', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
