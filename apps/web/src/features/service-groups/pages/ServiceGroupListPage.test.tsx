import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ServiceGroupListPage } from './ServiceGroupListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServiceGroupListPage', () => {
  it('renders page title "Grupos de Serviço"', () => {
    render(<ServiceGroupListPage />);
    expect(screen.getByText('Grupos de Serviço')).toBeInTheDocument();
  });

  it('renders "Novo Grupo" CTA button', () => {
    render(<ServiceGroupListPage />);
    expect(screen.getByText('Novo Grupo')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    render(<ServiceGroupListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with service group data after loading', () => {
    render(<ServiceGroupListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('ABC Paulista')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<ServiceGroupListPage />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('ABC Paulista')).not.toBeInTheDocument();
  });
});
