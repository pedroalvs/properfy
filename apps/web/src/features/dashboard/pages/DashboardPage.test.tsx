import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider } from '@/hooks/useAuth';
import { DashboardPage } from './DashboardPage';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function renderPage() {
  return render(
    <Wrapper>
      <DashboardPage />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage', () => {
  it('renders page title "Dashboard"', () => {
    renderPage();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    const loadingEl = screen.getByRole('status');
    expect(loadingEl).toHaveAttribute('aria-busy', 'true');
  });

  it('renders summary cards after loading', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getAllByText('Rascunho').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Aguardando Inspetor').length).toBeGreaterThanOrEqual(1);
  });

  it('renders recent appointments section', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Vistorias Recentes')).toBeInTheDocument();
  });

  it('renders pending actions section', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Ações Pendentes')).toBeInTheDocument();
  });

  it('renders quick stats', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Imóveis cadastrados')).toBeInTheDocument();
    expect(screen.getByText('Inspetores ativos')).toBeInTheDocument();
    expect(screen.getByText('Grupos de serviço ativos')).toBeInTheDocument();
  });

  it('hides loading state after data loads', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders 7 total stat cards (4 summary + 3 quick)', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(7);
  });

  it('does not render any CTA button', async () => {
    renderPage();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const buttons = screen.queryAllByRole('button');
    const ctaTexts = ['Novo', 'Criar', 'Adicionar', 'Exportar', 'Importar'];
    for (const button of buttons) {
      for (const cta of ctaTexts) {
        expect(button.textContent).not.toContain(cta);
      }
    }
  });
});
