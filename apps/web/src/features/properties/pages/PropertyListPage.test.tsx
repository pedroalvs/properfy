import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PropertyListPage } from './PropertyListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PropertyListPage', () => {
  it('renders page title "Imóveis"', () => {
    render(<PropertyListPage />);
    expect(screen.getByText('Imóveis')).toBeInTheDocument();
  });

  it('renders "Novo Imóvel" CTA button', () => {
    render(<PropertyListPage />);
    expect(screen.getByText('Novo Imóvel')).toBeInTheDocument();
  });

  it('renders filter bar with search and type controls', () => {
    render(<PropertyListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  });

  it('renders data table with property data after loading', () => {
    render(<PropertyListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('IMV-001')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<PropertyListPage />);
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('IMV-001')).not.toBeInTheDocument();
  });
});
