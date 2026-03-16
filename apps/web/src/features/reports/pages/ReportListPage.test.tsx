import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ReportListPage } from './ReportListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReportListPage', () => {
  it('renders page title "Relatórios"', () => {
    render(<ReportListPage />);
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  it('renders "Gerar Relatório" CTA button', () => {
    render(<ReportListPage />);
    expect(screen.getByText('Gerar Relatório')).toBeInTheDocument();
  });

  it('renders filter bar with type and status controls', () => {
    render(<ReportListPage />);
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with report data after loading', () => {
    render(<ReportListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getAllByText('Admin Principal').length).toBeGreaterThan(0);
  });
});
