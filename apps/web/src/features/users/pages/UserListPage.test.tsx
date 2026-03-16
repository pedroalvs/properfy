import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { UserListPage } from './UserListPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>{children}</SnackbarProvider>
  );
}

function renderPage() {
  return render(
    <Wrapper>
      <UserListPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UserListPage', () => {
  it('renders page title "Usuários"', () => {
    renderPage();
    expect(screen.getByText('Usuários')).toBeInTheDocument();
  });

  it('renders "Novo Usuário" CTA button', () => {
    renderPage();
    expect(screen.getByText('Novo Usuário')).toBeInTheDocument();
  });

  it('renders filter bar with search, role, and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with user data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Admin Principal')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
  });

  it('drawer shows correct user data', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('admin@properfy.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('closing drawer resets state', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Fechar'));
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText('Dados Pessoais')).not.toBeInTheDocument();
  });

  it('clicking different row updates drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButtons = screen.getAllByLabelText('Visualizar');
    fireEvent.click(viewButtons[0]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('admin@properfy.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(viewButtons[1]!);
    act(() => { vi.advanceTimersByTime(200); });
    const matches2 = screen.getAllByText('admin2@properfy.com');
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
