import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppointmentListPage } from './AppointmentListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppointmentListPage', () => {
  it('renders page title "Vistorias"', () => {
    render(<AppointmentListPage />);
    expect(screen.getByText('Vistorias')).toBeInTheDocument();
  });

  it('renders "Nova Vistoria" CTA button', () => {
    render(<AppointmentListPage />);
    expect(screen.getByText('Nova Vistoria')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    render(<AppointmentListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with appointment data after loading', () => {
    render(<AppointmentListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('VST-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<AppointmentListPage />);
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('VST-001')).not.toBeInTheDocument();
  });
});
