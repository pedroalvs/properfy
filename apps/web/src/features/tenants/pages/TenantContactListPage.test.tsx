import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TenantContactListPage } from './TenantContactListPage';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TenantContactListPage', () => {
  it('renders page title "Inquilinos"', () => {
    render(<TenantContactListPage />);
    expect(screen.getByText('Inquilinos')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    render(<TenantContactListPage />);
    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Status Confirmação')).toBeInTheDocument();
  });

  it('renders data table with tenant data after loading', () => {
    render(<TenantContactListPage />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<TenantContactListPage />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();
  });
});
