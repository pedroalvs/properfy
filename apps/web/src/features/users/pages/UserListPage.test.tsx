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
    const matches = screen.getAllByText('Novo Usuário');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search, role, and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Perfil').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table with user data after loading', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    const nameMatches = screen.getAllByText('Nome');
    expect(nameMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Admin Principal')).not.toBeInTheDocument();
  });

  it('clicking view icon opens drawer', () => {
    renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('admin@properfy.com');
    expect(matches.length).toBeGreaterThanOrEqual(1);
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
    const { container } = renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Narrow drawer should not have translate-x-full
    const narrowDrawer = container.querySelector('.w-drawer-narrow');
    expect(narrowDrawer).not.toHaveClass('translate-x-full');
    // Close the narrow drawer
    const closeButtons = container.querySelectorAll('[aria-label="Fechar"]');
    const narrowCloseButton = Array.from(closeButtons).find((btn) =>
      btn.closest('.w-drawer-narrow'),
    );
    fireEvent.click(narrowCloseButton!);
    act(() => { vi.advanceTimersByTime(0); });
    expect(narrowDrawer).toHaveClass('translate-x-full');
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
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
  });

  // New tests for form drawer integration
  it('clicking "Novo Usuário" opens form drawer with "Criar Usuário" submit button', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Usuário');
    fireEvent.click(ctaButtons[0]!);
    expect(screen.getByText('Criar Usuário')).toBeInTheDocument();
  });

  it('form drawer renders all form sections', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Usuário');
    fireEvent.click(ctaButtons[0]!);
    const matches = screen.getAllByText('Dados Pessoais');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Vínculo')).toBeInTheDocument();
  });

  it('closing form drawer hides form content', () => {
    const { container } = renderPage();
    const ctaButtons = screen.getAllByText('Novo Usuário');
    fireEvent.click(ctaButtons[0]!);
    const wideDrawer = container.querySelector('.w-drawer-wide');
    expect(wideDrawer).not.toHaveClass('translate-x-full');
    fireEvent.click(screen.getByText('Cancelar'));
    expect(wideDrawer).toHaveClass('translate-x-full');
  });

  it('edit from detail drawer opens form drawer with "Editar Usuário" title', () => {
    const { container } = renderPage();
    act(() => { vi.advanceTimersByTime(300); });
    // Open detail drawer
    const viewButton = screen.getAllByLabelText('Visualizar')[0]!;
    fireEvent.click(viewButton);
    act(() => { vi.advanceTimersByTime(200); });
    // Find edit button in narrow drawer
    const narrowDrawer = container.querySelector('.w-drawer-narrow');
    const editButton = narrowDrawer!.querySelector('[aria-label="Editar"]');
    fireEvent.click(editButton!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Editar Usuário')).toBeInTheDocument();
  });

  it('"Novo Usuário" button is present and clickable', () => {
    renderPage();
    const ctaButtons = screen.getAllByText('Novo Usuário');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    expect(ctaButtons[0]!.closest('button')).not.toBeNull();
  });
});
