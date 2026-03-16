import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { FinancialListPage } from './FinancialListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinancialListPage', () => {
  it('renders page title "Financeiro"', () => {
    render(<FinancialListPage />);
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });

  it('renders "Nova Entrada" CTA button', () => {
    render(<FinancialListPage />);
    expect(screen.getByText('Nova Entrada')).toBeInTheDocument();
  });

  it('renders filter bar with search, type, and status controls', () => {
    render(<FinancialListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with financial data after loading', () => {
    render(<FinancialListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('VIST-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<FinancialListPage />);
    expect(screen.getByText('Vistoria')).toBeInTheDocument();
    expect(screen.queryByText('VIST-001')).not.toBeInTheDocument();
  });
});
